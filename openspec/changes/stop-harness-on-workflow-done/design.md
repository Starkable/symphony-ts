## Context

当前 agent 执行模型（以 Cursor 为例）：

```
dispatch → harness.run() → for turn 1..maxTurns → finalizeWorkerExecution → PMS writeback
```

Harness 现有 break 条件（每 turn 后）：

1. `!isIssueStillActive(issue)` — PMS 已离开 active_states
2. `harnessEvent.kind !== turn_completed` — turn 失败/取消

**缺失**：`deriveEffectivePhase.allComplete === true`

BCS-496 证据（2026-06-21）：

- Turn 3 起 prompt 注入 `effective_phase: done`
- Turn 4–7 继续，`Current tracker state: 进行中`
- 无 `worker_exit_normal` / `pms_writeback`
- Turn 8 启动后 SIGINT

与 `fix-v12-pms-writeback-and-phase-derivation` 关系：

| 层 | 已 fix | 本 change |
|----|--------|-----------|
| 写回信号 | 产物 allComplete → done 信号 | — |
| orchestrator | worker 退出时写 PMS；抑制 continuation | — |
| **harness** | — | **done 时 break → 促成 worker 退出** |

## Goals / Non-Goals

**Goals:**

- V1.2 六阶段完成后，下一 turn **不**再启动；当前 done turn 正常完成。
- Worker `outcome=normal` 退出 → `processCompletionSignal` → PMS「提测→已提测」。
- Cursor 与 Codex harness 行为一致。
- 可观测：structured log 标明因 workflow done 停止。

**Non-Goals:**

- 在 harness 内直接调用 PMS API（仍由 orchestrator 写回）。
- 修改 max_turns 默认值或 WORKFLOW 配置。
- V1.1 workpad `Phase: done` 的 harness 停止（可后续扩展；本 change 聚焦 V1.2 产物 allComplete）。
- 澄清失败 `failed` 的 harness 停止（仍跑至 agent 结束或 max_turns）。

## Decisions

### D1：停止检查时机 — 每 turn **成功后**

**选择**：在 `turn_completed` 且 `refreshIssueState` 之后，调用 `shouldStopForWorkflowDone(workspacePath, issue, workflow)`；若为 true 则 `break`。

**理由**：允许 archive 所在 turn 跑完并落盘；避免 turn 中途截断。

**备选**：prompt 构建前若已 done 则 skip turn — 拒绝，会跳过「交付说明」turn 且无新产物时无 harm。

### D2：判定函数复用 deriveEffectivePhase

**选择**：共享 helper：

```typescript
async function isWorkflowAllComplete(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig | null;
}): Promise<boolean>
```

内部 `workflow.phases.length > 0` 时调用 `deriveEffectivePhase`，返回 `derived.allComplete`。

**理由**：与 dispatch、写回、exporter 同一真相源；不重复解析逻辑。

### D3：双 harness 一致实现

**选择**：逻辑放入 `src/workflow/workflow-harness-stop.ts`（或类似），Cursor harness 与 AgentRunner 均调用。

### D4：与 isIssueStillActive 的优先级

**选择**：同一 turn 末尾依次检查：

1. workflow allComplete → break（并 log `harness_stop_workflow_done`）
2. !isIssueStillActive → break（现有）
3. turn 非 completed → break（现有）

若 allComplete 但 PMS 仍 active，**仍 break**（打破原先死锁）。

### D5：done turn 的 prompt 不变

**选择**：继续使用 `appendWorkflowDispatchSection` 的 done 文案（「All workflow artifacts are complete」），不在 prompt 要求 Agent 写 workpad。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 误判 allComplete 过早停止 | 单测覆盖 archived 全产物；与 deriveEffectivePhase 测试共享场景 |
| 用户希望 done 后继续加需求 | 新 dispatch / 人工 reopen PMS；文档说明 |
| Codex/Cursor 行为漂移 | 共享 helper + 两边单测 |
| SIGINT 仍无写回 | 文档说明需正常退出；非本 change 范围（可考虑后续 graceful shutdown 写回） |

## Migration Plan

1. 实现 + 单测 + `pnpm test` 相关模块。
2. `pnpm build` 重启 orchestrator。
3. BCS 测试工单重跑：archive 后 1–2 turn 内出现 `harness_stop_workflow_done`、`worker_exit_normal`、`pms_writeback`。
4. 无配置迁移。

## Open Questions

- （无阻塞）SIGINT 时是否 best-effort 写回留后续 change。
