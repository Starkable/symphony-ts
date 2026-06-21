## Why

`fix-v12-pms-writeback-and-phase-derivation` 已打通「V1.2 产物 allComplete → worker 退出时 PMS 写回已提测」，但 BCS-496 联调表明：archive 完成后 `effective_phase: done` 时 **Cursor harness 仍按 max_turns 继续 intra-session turn**（Turn 3–7 空转），PMS 写回仅在 `finalizeWorkerExecution(outcome=normal)` 触发，导致日志中长时间无 `pms_writeback`，用户 SIGINT 后仍停留在「进行中」。根因是 harness 结束条件未包含 workflow done，形成「Symphony 已 done、PMS 仍 active、写回未触发」的状态机缺口。需在 agent harness 层在 V1.2 全部完成时主动结束 worker session，闭合 PMS 写回链路。

## What Changes

- **Cursor harness**：每 turn 正常结束后，若配置了 `workflow.phases` 且 `deriveEffectivePhase.allComplete === true`，SHALL **break** turn 循环，使 worker 正常退出并触发 orchestrator PMS 写回（与 `fix-v12-pms-writeback` 衔接）。
- **Codex runner**：同上逻辑，保持双 harness 行为一致。
- **日志**：worker 因 workflow done 提前结束时记录 structured log（如 `harness_stop_workflow_done`），含 issue identifier、turn_number、change_ref。
- **Prompt 注入**：`effective_phase: done` 的 turn 仍允许执行（交付 turn）；**下一 turn 不再启动**（break 发生在当前 turn 完成之后）。
- **Legacy 模式**：无 `workflow.phases` 时行为不变；V1.1 仍依赖 max_turns / `isIssueStillActive` / workpad。
- **文档**：更新 `docs/symphony-agent-workflow.md` 说明 done 后 harness 停止与 PMS 写回时序。

## Capabilities

### New Capabilities

- `harness-stop-on-workflow-done`：V1.2 workflow 全部完成时 agent harness 提前结束 worker session，不再空转至 max_turns。

### Modified Capabilities

- `symphony-workflow-dispatch`（delta）：补充「allComplete 后 harness SHALL 停止 turn 循环」与 PMS 写回时序说明。
- `v12-pms-artifact-writeback`（delta，来自 `fix-v12-pms-writeback-and-phase-derivation`）：明确写回触发前提是 worker 正常退出，harness 负责在 done 时促成退出。

## Impact

- **代码**：`src/agent/backends/cursor/cursor-harness.ts`、`src/agent/runner.ts`（Codex）；可抽取共享 helper（如 `shouldStopHarnessForWorkflowDone`）。
- **测试**：harness/runner 单测：mock allComplete → 仅 1 turn 后退出；未完成时仍多 turn。
- **依赖**：依赖已实现的 `deriveEffectivePhase`、`processCompletionSignal`；无新 WORKFLOW 配置项。
- **运维**：BCS 场景 archive 后应出现 `worker_exit_normal` + `pms_writeback`，不再 Turn 4–20 空转。
