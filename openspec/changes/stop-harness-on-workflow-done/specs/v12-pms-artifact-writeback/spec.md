## MODIFIED Requirements

### Requirement: V1.2 产物完成触发 PMS 归档写回

当 WORKFLOW 配置了非空 `workflow.phases`（V1.2）且 worker **正常退出**时，orchestrator SHALL 调用 `deriveEffectivePhase`（或等价产物扫描）。若结果为 `allComplete === true`，SHALL 触发与 workpad `Phase: done` 相同的 PMS 写回：匹配 transition **提测**（目标态 **已提测**），且 SHALL NOT 自动 POST 备注。

Agent harness SHALL 在检测到 allComplete 后结束 worker session，以确保写回不必等待 max_turns 或依赖 PMS 先变为终态。

#### Scenario: 无 workpad 归档成功写回已提测

- **WHEN** worker 正常退出
- **AND** workspace 不存在 `.symphony/workpad.md`
- **AND** V1.2 六阶段产物均满足完成语义（含 archived archive.md pass）
- **THEN** orchestrator SHALL 执行提测 transition 至已提测

#### Scenario: harness 停止到写回的时序

- **WHEN** 末阶段 turn 完成且 allComplete 为 true
- **THEN** harness SHALL 结束 session
- **AND** orchestrator 在 worker 正常退出后 SHALL 执行 PMS 写回（best-effort）

#### Scenario: 产物 done 与 workpad done 幂等

- **WHEN** workpad Phase 为 done 且产物扫描亦为 allComplete
- **THEN** PMS transition SHALL 至多执行一次（已提测则 skip）
