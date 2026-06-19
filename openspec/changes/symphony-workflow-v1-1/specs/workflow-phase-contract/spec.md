## ADDED Requirements

### Requirement: 阶段主产物白名单

manifest-builder SHALL 按 V1.1 Phase Artifact Contract 为每个 Phase 分配 **主产物** 列表；SHALL NOT 将 openspec 全套文件默认归入 `plan` 阶段。

#### Scenario: clarify 展示需求提案

- **WHEN** export 后 manifest 生成且 `openspec/changes/<ref>/proposal.md` 存在
- **THEN** `clarify` 阶段 artifacts SHALL 包含该 proposal 条目（展示名「需求提案」）

#### Scenario: proposal_review 展示评审报告

- **WHEN** `.symphony/workflow/phases/proposal_review/评审报告.md` 存在
- **OR** workpad Notes 含 `REVIEW_REPORT:` 且 exporter 合成报告文件
- **THEN** `proposal_review` 阶段 artifacts SHALL 包含评审报告条目

#### Scenario: plan 仅主展示 tasks

- **WHEN** manifest 生成
- **THEN** `plan` 阶段主 artifacts SHALL 仅包含 `tasks.md`（展示名「任务清单」）
- **AND** `design.md` 与 `specs/*` SHALL NOT 出现在 plan 阶段默认列表

#### Scenario: execute 不展示文档

- **WHEN** manifest 生成
- **THEN** `execute` 阶段 artifacts 列表 SHALL 为空
- **AND** MAY 在 runtime 摘要中暴露 turn 数与最后事件（非文件 artifact）

#### Scenario: verify 与 archive 展示报告

- **WHEN** 验证/归档报告文件存在或已从 Notes 合成
- **THEN** 对应 Phase artifacts SHALL 包含验证报告或归档说明条目

### Requirement: Notes 合成报告

exporter 或 manifest-builder SHALL 支持从 workpad Notes 解析 `REVIEW_REPORT` / `VERIFICATION_REPORT` 并合成可 Preview 的 markdown artifact（当 phases 目录下无物理文件时）。

#### Scenario: 仅 Notes 有 REVIEW_REPORT

- **WHEN** workpad Notes 含 `REVIEW_REPORT: PASS` 且无 `评审报告.md`
- **THEN** manifest SHALL 仍可在 `proposal_review` 阶段提供合成报告条目供 Dashboard Preview

### Requirement: 产物展示名映射

Dashboard SHALL 支持中文展示名（如「需求提案」「任务清单」），磁盘路径 SHALL 保持原英文/约定路径。

#### Scenario: API 返回展示名

- **WHEN** 客户端 GET workflow detail
- **THEN** artifact 条目 SHALL 含可用于 UI 的中文 label 或等价 display_name 字段

### Requirement: Gate 中文展示

Dashboard SHALL 将 Gate id 与结果以中文辅助文案展示（如「澄清门禁 (C0)：待通过」）。

#### Scenario: Gate pending 展示

- **WHEN** Gate result 为 pending
- **THEN** 详情页 SHALL 展示中文 Gate 说明而非仅 `pending` 英文
