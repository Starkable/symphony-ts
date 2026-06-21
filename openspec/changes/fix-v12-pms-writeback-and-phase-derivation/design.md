## Context

Symphony 当前存在两套 workflow 进度模型：

| 模型 | 进度真相 | PMS 写回信号 |
|------|----------|--------------|
| V1.1 legacy | `.symphony/workpad.md` 的 `Phase` | workpad `Phase: done` / `failed`+`CLARIFY_BLOCKED` |
| V1.2 artifact-driven | `deriveEffectivePhase(workflow.phases)` | **未接入**（仍读 workpad） |

BCS-496 联调（workspace `F:/tmp/workspaces/2192507`）证据：

1. Turn 7 完成 archive，`archive.md`（`status: pass`）位于 `openspec/changes/archive/2026-06-21-bcs-496/`。
2. workspace 无 `workpad.md` → `PmsWritebackService.processWorkpadSignal` 跳过或 `signal.kind === none`。
3. Turn 8 continuation 时 `effective_phase: clarify`（active 路径 `proposal.md` 已随 archive mv 消失）。
4. PMS tracker state 仍为「进行中」。

现有 `deriveEffectivePhase` 仅对 **archive** 阶段在 active 路径缺失时扫描 `openspec/changes/archive/*-{change_ref}/`；其他阶段无此 fallback。

约束：

- Agent 不直接调 PMS API；写回由 orchestrator 在 worker 正常退出后 best-effort 执行。
- BCS transition 名：**提测** → 已提测；**暂停开发** → 开发暂停（已验证）。
- `terminal_states` 用于读侧 JQL / reconcile，**不是**写回触发器。

## Goals / Non-Goals

**Goals:**

- V1.2 六阶段产物全部完成（含 archived `archive.md` pass）时，worker 正常退出触发 PMS transition 至已提测。
- 归档 mv 后 `deriveEffectivePhase` 仍返回 `done`，Dashboard / prompt / exporter 一致。
- workpad `Phase: done` 路径保留，与产物 done 幂等（已提测则 skip）。
- continuation retry 在 workflow `done` 且写回已触发或 issue 已终态时不重复 dispatch。
- 单元测试与文档同步。

**Non-Goals:**

- V1.2 下无 workpad 的 **CLARIFY_BLOCKED** 产物信号（仍依赖 workpad 或后续 change）。
- 修改 PMS OAuth、transition 匹配规则、WORKFLOW 新配置项。
- 修改 `terminal_states` 语义或 startup terminal cleanup 逻辑。
- Agent prompt 要求 Agent 写 workpad `Phase: done`（违背 V1.2 设计）。

## Decisions

### D1：写回信号解析统一入口

**选择**：新增 `resolveWritebackSignal(input)`，按优先级合并：

1. workpad 信号（现有 `parseWorkpadWritebackSignal`）— clarify_blocked / done
2. 若 signal 为 `none` 且 `workflow.phases` 已配置：调用 `deriveEffectivePhase`，若 `allComplete === true` → `{ kind: "done" }`

**理由**：单入口便于 `runtime-host.finalizeWorkerExecution` 与 pending 重试复用；workpad 优先保持 V1.1 行为。

**备选**：在 `runtime-host` 内联判断 — 拒绝，逻辑分散难测。

### D2：归档目录产物 fallback 推广至全阶段

**选择**：抽取 `resolveArtifactPath(workspacePath, changeRef, relativePath)`：

1. 若 `join(workspacePath, relativePath)` 存在 → 用 active 路径
2. 否则在 `openspec/changes/archive/` 下查找目录名 suffix `-{change_ref}`，拼接同名相对文件名

**理由**：与 V1.2 契约「archive 先写产物再 mv」一致；archive 阶段已有同类逻辑，推广避免 clarify 回退。

**备选**：archive 完成后保留 active change 目录 symlink — 拒绝，与 openspec-archive-change skill 行为冲突。

### D3：continuation 停止条件

**选择**：在 `OrchestratorCore.onWorkerExit`（或 dispatch 前 gate）中，若配置了 V1.2 workflow 且上次 worker 退出时 `deriveEffectivePhase.allComplete === true`，则 **不** schedule continuation retry（`delayType: continuation`）。

**理由**：BCS 场景 issue 在写回前仍属 `active_states`，continuation 会导致 Turn 8 类重复派活；写回成功后 poll reconcile 会自然停止。

**备选**：永远 continuation 直到 PMS 终态 — 拒绝，在写回延迟时浪费 agent turn。

**实现注记**：需在 worker 退出路径传递 `workflowComplete: boolean` 快照（退出瞬间扫描产物，避免后续 workspace 变更）。

### D4：`runtime-host` 传参扩展

**选择**：`finalizeWorkerExecution` 调用写回时传入 `workflow: SymphonyWorkflowConfig | null`；`PmsWritebackService.processCompletionSignal` 替代或包装 `processWorkpadSignal`。

**理由**：写回服务需 workflow.phases 做产物扫描，不应在 service 内读 WORKFLOW 文件。

### D5：幂等与 pending

**选择**：产物 done 与 workpad done 共用 `executeDone`；已处于 `已提测`（alias 匹配）则 skip；失败仍入 pending 队列，poll tick `retryPending` 不变。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| archive 目录多个 `-{change_ref}` 匹配 | 取最新修改时间的目录，或按日期前缀排序取最新；单测覆盖 |
| 写回成功但 PMS 刷新延迟，continuation 仍触发 | 以 `workflowComplete` 快照抑制 continuation；reconcile 下一轮刷新 state |
| 部分阶段产物仅在 archive 目录、部分仍在 active | fallback 按文件粒度独立解析，不要求整目录 mv 原子可见 |
| legacy 无 workflow.phases 误触发 | 仅当 `workflow?.phases?.length > 0` 时启用产物 done 信号 |

## Migration Plan

1. 合并代码并 `pnpm test`。
2. 本地用 BCS 测试工单重跑 V1.2 全流程；确认 Turn 7 后 PMS → 已提测、无 Turn 8 clarify 回退。
3. 已有进行中工单：下次 archive 完成自动写回；或手动 `pms:probe --transition-to 已提测` 一次性修复。
4. 回滚：revert PR；无数据迁移。

## Open Questions

- （无阻塞项）CLARIFY 无 workpad 的产物信号留后续 change，本设计不展开。
