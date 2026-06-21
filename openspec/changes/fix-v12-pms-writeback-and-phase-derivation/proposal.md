## Why

Symphony V1.2 已以产物扫描（`deriveEffectivePhase`）作为 workflow 进度唯一真相，并明确不依赖 `.symphony/workpad.md`；但 PMS 写回仍仅识别 V1.1 信号 `workpad Phase: done`。BCS-496 联调证据表明：archive 阶段完成后 PMS 仍为「进行中」，因 workspace 无 workpad、写回被跳过。同时，openspec archive 将 change 目录 mv 至 `archive/` 后，阶段推导在 clarify 处回退（active 路径下 `proposal.md` 不存在），导致 continuation retry 误判并重复派活。该缺口阻断「归档成功 → 已提测」的产品闭环，需在 orchestrator 层打通 V1.2 产物完成与 PMS 写回，并修复归档后阶段推导。

## What Changes

- **PMS 写回扩展**：worker 正常退出时，除 workpad `Phase: done` 外，当 WORKFLOW 启用 `workflow.phases`（V1.2）且 `deriveEffectivePhase` 返回 `allComplete === true`（含 archived 目录下 pass 的 `archive.md`）时，SHALL 触发与 done 相同的 transition（**提测** → **已提测**）。
- **CLARIFY 写回兼容**：V1.2 下澄清阻塞若仍通过 workpad `Phase: failed` + `CLARIFY_BLOCKED:` 表达，保持现有写回路径；若未来无 workpad，本 change 不扩展 clarify 产物信号（留后续 change）。
- **归档后阶段推导修复**：`deriveEffectivePhase` 在 active change 路径缺失时，SHALL 回退扫描 `openspec/changes/archive/*-{change_ref}/` 下对应产物（与 archive 阶段现有 fallback 一致，推广至全部阶段）。
- **continuation 行为**：当 effective phase 为 `done` 时，orchestrator 正常退出后 SHALL NOT 因 continuation retry 再次 dispatch 同一 issue（在 PMS 仍为 active state 时）；写回成功后 reconcile 自然停止 worker。
- **文档**：更新 `docs/pms-field-mapping.md` 与 `docs/symphony-agent-workflow.md` 中 V1.2 写回矩阵，明确产物 done 与 workpad done 双路径（workpad 为 legacy 兼容）。
- **测试**：单元测试覆盖「仅 archived 产物 → done」「worker 退出 → PMS transition」；不破坏现有 workpad 写回测试。

## Capabilities

### New Capabilities

- `v12-pms-artifact-writeback`：V1.2 产物全部完成时 orchestrator 触发 PMS 归档成功写回（已提测），与 workpad done 幂等共存。
- `v12-archive-phase-derivation`：归档 mv 后全阶段产物在 archive 目录下仍可正确推导 effective phase 为 done。

### Modified Capabilities

- `pms-orchestrator-writeback`（delta）：扩展「归档成功写回已提测」触发条件，纳入 V1.2 产物完成信号。
- `symphony-workflow-dispatch`（delta）：明确全部完成且 issue 仍在 active_states 时的 continuation 停止语义；归档后 effective phase 不得回退。

## Impact

- **代码**：`src/tracker/pms/pms-writeback.ts`、`src/orchestrator/runtime-host.ts`、`src/workflow/derive-effective-phase.ts`、可能新增 `src/workflow/artifact-writeback-signal.ts`（或扩展现有 signal 模块）。
- **测试**：`tests/tracker/pms/pms-writeback.test.ts`、`tests/workflow/derive-effective-phase.test.ts`、可选 orchestrator/runtime-host 集成测试。
- **文档**：`docs/pms-field-mapping.md`、`docs/pms-tracker.md`、`docs/symphony-agent-workflow.md`。
- **配置**：无需 WORKFLOW 新字段；现有 `terminal_states: [已提测]` 与 transition 名不变。
- **兼容性**：V1.1 workpad `Phase: done` 路径保留；无 `workflow.phases` 时行为不变。
