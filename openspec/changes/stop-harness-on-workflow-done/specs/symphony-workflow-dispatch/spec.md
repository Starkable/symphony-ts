## MODIFIED Requirements

### Requirement: 产物扫描推导 effective phase

启用 V1.2 workflow 时，Symphony SHALL 按 `workflow.phases` 顺序扫描各阶段 `produces` 完成状态，第一个未完成的阶段 SHALL 为 `effective_phase`。若全部完成，workflow 状态 SHALL 为 `done`。

当全部完成（`allComplete === true`）时，agent harness SHALL 在当前 turn 成功结束后停止 turn 循环，使 orchestrator 能在 worker 正常退出时执行 PMS 写回等终态副作用。

#### Scenario: 首个未完成阶段

- **WHEN** `proposal.md` 存在且 `proposal_review.md` 不存在
- **THEN** effective_phase.id SHALL 为 `proposal_review`

#### Scenario: 全部完成

- **WHEN** 六阶段产物均满足完成语义
- **THEN** effective_phase SHALL 为 null 或 sentinel `done`

#### Scenario: 全部完成后 harness 停止

- **WHEN** 六阶段产物均满足完成语义且当前 turn 已成功完成
- **THEN** harness SHALL NOT 继续 intra-session continuation turns
- **AND** orchestrator SHALL 有机会在 worker 正常退出后触发配置的 tracker 写回

### Requirement: 不依赖 workpad Phase

V1.2 workflow dispatch SHALL NOT 要求 `.symphony/workpad.md` 存在或读取其中 Phase 字段以决定派活。workpad 为可选且 MAY 不存在。

V1.2 下 workflow 完成判定 SHALL NOT 依赖 Agent 写入 workpad `Phase: done`；harness 停止 SHALL 由产物 allComplete 驱动。

#### Scenario: 无 workpad 文件

- **WHEN** workspace 不存在 `.symphony/workpad.md`
- **AND** V1.2 workflow 已启用且产物扫描可推导 effective_phase
- **THEN** Symphony SHALL 正常 dispatch agent

#### Scenario: 无 workpad 时 done 后停止

- **WHEN** workspace 无 workpad 且产物 allComplete
- **THEN** harness SHALL 停止 turn 循环
