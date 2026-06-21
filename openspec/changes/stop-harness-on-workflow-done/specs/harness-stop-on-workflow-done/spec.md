## ADDED Requirements

### Requirement: V1.2 workflow 完成后停止 harness turn 循环

当 WORKFLOW 配置了非空 `workflow.phases` 时，agent harness（Cursor 与 Codex）SHALL 在每个 turn **成功完成**（`turn_completed`）后评估 `deriveEffectivePhase`。若 `allComplete === true`，harness SHALL 结束 turn 循环并使 worker session 正常退出，且 SHALL NOT 启动下一 turn。

#### Scenario: archive 完成后不再空转

- **WHEN** 某 turn 成功结束且产物扫描 `allComplete === true`
- **THEN** harness SHALL NOT 启动 continuation turn N+1
- **AND** worker session SHALL 以正常 outcome 结束

#### Scenario: 未完成 workflow 仍允许多 turn

- **WHEN** 某 turn 成功结束但 `allComplete === false`（例如 effective_phase 为 execute）
- **THEN** harness MAY 继续下一 turn 直至 max_turns 或其他既有 break 条件

#### Scenario: 无 workflow.phases 时行为不变

- **WHEN** WORKFLOW 未配置 `workflow.phases`（legacy 模式）
- **THEN** harness SHALL NOT 因产物 allComplete 而 break
- **AND** 既有 max_turns / isIssueStillActive 逻辑保持不变

### Requirement: workflow done 停止的可观测日志

因 V1.2 workflow allComplete 而停止 harness 时，系统 SHALL 记录 structured log，事件名 SHALL 为 `harness_stop_workflow_done`（或等价固定名），并含 `issue_identifier`、`turn_number`、`change_ref`。

#### Scenario: 日志含 issue 与 turn

- **WHEN** harness 因 allComplete break
- **THEN** 日志 SHALL 含 issue_identifier 与停止时的 turn_number

### Requirement: done turn 仍完整执行

当某 turn 开始时 effective_phase 已为 done，该 turn SHALL 仍被允许执行完毕；停止决策 SHALL 仅在该 turn 成功完成后生效。

#### Scenario: 交付 turn 不被截断

- **WHEN** turn 开始时 prompt 注入 `effective_phase: done`
- **AND** agent 正常完成该 turn
- **THEN** harness SHALL 在该 turn 结束后停止
- **AND** SHALL NOT 在 turn 中途 abort
