## ADDED Requirements

### Requirement: 产物扫描推导 effective phase

启用 V1.2 workflow 时，Symphony SHALL 按 `workflow.phases` 顺序扫描各阶段 `produces` 完成状态，第一个未完成的阶段 SHALL 为 `effective_phase`。若全部完成，workflow 状态 SHALL 为 `done`。

#### Scenario: 首个未完成阶段

- **WHEN** `proposal.md` 存在且 `proposal_review.md` 不存在
- **THEN** effective_phase.id SHALL 为 `proposal_review`

#### Scenario: 全部完成

- **WHEN** 六阶段产物均满足完成语义
- **THEN** effective_phase SHALL 为 null 或 sentinel `done`

### Requirement: 每 turn Prompt 注入 handler 与产物

启用 V1.2 时，每 agent turn（含续跑 turn）Prompt SHALL 包含：effective_phase.id、`/{handler}`、展开后的 `produces` 路径。SHALL NOT 在续跑 turn 仅使用固定英文续跑文案而省略上述信息。

#### Scenario: 续跑 turn 仍注入 handler

- **WHEN** turnNumber 大于 1 且 V1.2 workflow 已启用
- **THEN** Prompt SHALL 仍包含当前 `/{handler}` 与 `produces` 路径

### Requirement: 不依赖 workpad Phase

V1.2 workflow dispatch SHALL NOT 要求 `.symphony/workpad.md` 存在或读取其中 Phase 字段以决定派活。workpad 为可选且 MAY 不存在。

#### Scenario: 无 workpad 文件

- **WHEN** workspace 不存在 `.symphony/workpad.md`
- **AND** V1.2 workflow 已启用且产物扫描可推导 effective_phase
- **THEN** Symphony SHALL 正常 dispatch agent

### Requirement: Dashboard 产物映射

artifact-store manifest 构建 SHALL 按 V1.2 契约将六阶段主产物映射至对应 phase id，扫描 `openspec/changes/{change_ref}/` 下英文文件名；SHALL NOT 以 `.symphony/workflow/phases/` 作为主产物来源。

#### Scenario: verify 阶段展示 verification.md

- **WHEN** `verification.md` 存在于 change 目录
- **THEN** Dashboard manifest 中 verify 阶段 artifacts SHALL 包含该文件
