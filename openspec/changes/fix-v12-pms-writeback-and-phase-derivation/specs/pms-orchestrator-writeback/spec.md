## MODIFIED Requirements

### Requirement: 归档成功写回已提测

当 worker 正常结束且满足以下 **任一** 条件时，orchestrator SHALL 匹配 transition **提测**（目标态 已提测）并执行，且 SHALL NOT 自动 POST 备注：

1. workspace `.symphony/workpad.md` 中 `Phase=done`（V1.1 legacy）
2. WORKFLOW 配置了非空 `workflow.phases`，且 `deriveEffectivePhase` 返回 `allComplete === true`（V1.2 产物驱动，含 archived 目录产物）

#### Scenario: workpad done 写回已提测

- **WHEN** turn 正常结束且 workpad Phase 为 done
- **THEN** PMS 工单执行提测 transition 至已提测

#### Scenario: V1.2 产物 done 写回已提测

- **WHEN** worker 正常结束且无 workpad done 信号
- **AND** V1.2 六阶段产物均完成（含 archived archive.md pass）
- **THEN** PMS 工单执行提测 transition 至已提测

#### Scenario: done 不写备注

- **WHEN** 归档成功写回已提测（workpad 或产物触发）
- **THEN** 不调用 addIssueComment
