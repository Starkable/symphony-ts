## ADDED Requirements

### Requirement: V1.2 产物完成触发 PMS 归档写回

当 WORKFLOW 配置了非空 `workflow.phases`（V1.2）且 worker 正常退出时，orchestrator SHALL 调用 `deriveEffectivePhase`（或等价产物扫描）。若结果为 `allComplete === true`，SHALL 触发与 workpad `Phase: done` 相同的 PMS 写回：匹配 transition **提测**（目标态 **已提测**），且 SHALL NOT 自动 POST 备注。

产物完成判定 SHALL 包含 archived change 目录下的产物（见 `v12-archive-phase-derivation`）。

#### Scenario: 无 workpad 归档成功写回已提测

- **WHEN** worker 正常退出
- **AND** workspace 不存在 `.symphony/workpad.md`
- **AND** V1.2 六阶段产物均满足完成语义（含 archived `archive.md` status pass）
- **THEN** orchestrator SHALL 执行提测 transition 至已提测

#### Scenario: 产物 done 与 workpad done 幂等

- **WHEN** workpad Phase 为 done 且产物扫描亦为 allComplete
- **THEN** PMS transition SHALL 至多执行一次（已提测则 skip）

#### Scenario: 产物未完成不写回

- **WHEN** worker 正常退出但 effective phase 不为 done（例如 verify 未完成）
- **AND** workpad 无 done/failed 写回信号
- **THEN** orchestrator SHALL NOT 执行提测 transition

### Requirement: 写回信号优先级

写回信号解析 SHALL 按以下顺序：

1. workpad `CLARIFY_BLOCKED`（Phase failed + Notes）
2. workpad `Phase: done`
3. V1.2 产物 `allComplete === true`

若较高优先级已产生非 `none` 信号，SHALL NOT 重复执行冲突写回。

#### Scenario: clarify_blocked 优先于产物 done

- **WHEN** workpad Phase 为 failed 且 Notes 含 CLARIFY_BLOCKED
- **AND** 产物扫描为 allComplete
- **THEN** SHALL 执行开发暂停写回而非提测

### Requirement: 结构化日志区分信号来源

PMS 写回 structured log SHALL 包含 `signal_source` 字段，取值为 `workpad` 或 `artifact_v12`（或等价枚举），以便排查 V1.2 写回路径。

#### Scenario: 产物触发写回日志带来源

- **WHEN** 由 V1.2 产物 allComplete 触发提测 transition
- **THEN** 日志 SHALL 含 `signal_source: artifact_v12`
