## Context

Symphony 有三条 PMS 查询路径，职责不同：

| 路径 | 方法 | 时机 | 目的 |
|------|------|------|------|
| 派活 | `fetchCandidateIssues` | 每 poll | 发现「进行中」工单并 dispatch |
| 刷新 | `fetchIssueStatesByIds` | 每 poll reconcile | 刷新 running 工单的 tracker 状态 |
| 清盘 | `fetchIssuesByStates` | **启动时** | 删除 PMS 终态工单的 stale workspace |

Artifact Store（Workflow Dashboard）在 `symphony-workflow-dashboard` change 中引入，将 export 挂在 turn 结束与 `removeForIssue` 之前。启动 cleanup 在 `artifact_store.enabled` 时调用 `exportBeforeRemove → exportTerminalIssue`，与 upstream §8.6「仅删 workspace」的原始意图叠加，产生「凡 PMS 终态即写 store」的副作用。

联调证据：BCS-420（已提测、从未 dispatch）在启动同一秒写入 `F:/tmp/data/BCS-420/`，`artifacts: []`，`terminal_phase: null`，Dashboard Active 误展示。

## Goals / Non-Goals

**Goals:**

- Poll 保持唯一「发现新任务并派活」入口
- 保留启动 terminal workspace cleanup（删 stale 目录）
- Export 仅发生在 Symphony 有本地执行证据时
- Dashboard Active/History 语义清晰，不依赖实时 PMS 查询
- 与 `SPEC.upstream.md` §8.6 兼容（仍查询终态并 remove workspace）

**Non-Goals:**

- 改为 filesystem-first startup（扫描 workspace 再查 PMS）——可后续优化
- 自动迁移/删除已有空壳 store 目录
- 修改 poll JQL、PMS writeback、OpenSpec phase 门控
- Dashboard 实时查 PMS 状态

## Decisions

### D1：保留 `fetchIssuesByStates` 启动查询，export 加本地门槛

**选择**：继续 `fetchIssuesByStates(terminal_states)` → 对每条 issue 判断 workspace 与产物 → 有条件 export → `removeForIssue`。

**理由**：符合 upstream §8.6；实现改动集中在 export 路径；`removeForIssue` 对不存在的目录已是 force rm，无害。

**备选（未选）**：filesystem-first，仅扫描 `workspace.root` 再 `fetchIssueStatesByIds`——减少 PMS API 调用，但与 spec 字面行为偏离，留作后续 change。

### D2：`hasExportableContent` 判定

**选择**：workspace 下满足**任一**即视为有产物：

1. `openspec/changes/<change_ref>/` 存在任一 V1.2 阶段文件（`proposal.md`、`tasks.md`、`verification.md` 等，与 `openspec-scan` 一致）
2. `.symphony/` 下存在 turn log（`cursor-turn-*.log` 或现有 scan 规则）
3. `.symphony/workpad.md` 非空（legacy V1）

仅 `after_create` clone、无 Agent turn → **无产物**，不 export。

**实现位置**：`src/artifact-store/exportable-content.ts`（或 exporter 内私有函数），供 runtime-host 与 exporter 共用。

### D3：`archived_reason` 元数据

**选择**：在 `WorkflowMeta` 增加可选字段 `archived_reason?: string | null`。

- startup terminal cleanup 成功 export 时设为 `"pms_terminal_cleanup"`
- worker reconcile 终态 export（`exportIssueBeforeCleanup`）同样设为 `"pms_terminal_cleanup"`
- OpenSpec 自然终态（`terminal_phase` 为 `done`/`failed`）保持现有逻辑，**可不**重复写 `archived_reason`

**理由**：区分「OpenSpec 流程完成」与「PMS 已终态、Symphony 被 cleanup 归档」；Active 过滤简单。

### D4：Dashboard Active / Archived 规则

**Active**：

```
running 中
OR (
  store 有条目
  AND archived_reason 为空/null
  AND terminal_phase 为空/null
)
```

**Archived**：

```
非 running
AND (
  archived_reason 非空
  OR terminal_phase ∈ { done, failed }
)
```

空壳（本 change 后不应新建）若遗留：`terminal_phase null` 且无 `archived_reason` 仍会进 Active——运维清目录；可选后续加 `artifact_count === 0` 过滤，本 change 不强制。

### D5：Turn 增量 export 不加强制门槛

**选择**：running worker 的 turn 结束 export **保持现状**（允许早期建立 store 目录）。

**理由**：running 本身证明 Symphony 已接手；门槛主要针对 startup cleanup 对从未 running 的终态工单。

Worker 终态退出（`cleanupWorkspace === true`）的 export 与 startup 共用 `requireContent` 路径。

### D6：日志

startup 跳过 export 时打 `startup_terminal_skip_export`，字段：`issue_id`、`issue_identifier`、`reason: "no_workspace" | "empty_workspace"`。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| PMS 已终态、Symphony 跑过一半 → cleanup 后进 History 而非 Active | 产品已确认可接受；半成品可在 History 查看 |
| 遗留空壳仍占 Active | 文档说明一次性清 `artifact_store.root`；不自动删 |
| `hasExportableContent` 与 V1.2 产物演进漂移 | 复用 `openspec-scan` 已有扫描逻辑，单点维护 |
| reconcile export 与 startup export 重复 | 幂等 write meta/manifest；先 export 再 remove |

## Migration Plan

1. 合入代码后重启 Symphony——新启动不再产生空壳
2. 运维删除已有空壳：`F:/tmp/data/BCS-420/` 等（无 openspec/logs 的目录）
3. 无需 WORKFLOW 配置变更
4. 回滚：revert change；已写入的 meta 不受影响

## Open Questions

- （已关闭）PMS 终态半成品是否进 History → **是**，使用 `archived_reason`
- 是否在 UI 展示 `archived_reason` 文案 → 本 change 仅 API/数据层，UI 文案可后续补充
