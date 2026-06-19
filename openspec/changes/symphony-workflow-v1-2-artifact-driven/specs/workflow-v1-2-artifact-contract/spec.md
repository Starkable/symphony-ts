## ADDED Requirements

### Requirement: V1.2 六阶段产物路径

Workflow V1.2 SHALL 规定每个 issue 对应唯一 `{change_ref}`（issue identifier 的 kebab-case），且六阶段主产物路径 SHALL 为：

| phase id | produces 相对路径 |
|----------|-------------------|
| clarify | `openspec/changes/{change_ref}/proposal.md` |
| proposal_review | `openspec/changes/{change_ref}/proposal_review.md` |
| plan | `openspec/changes/{change_ref}/tasks.md` |
| execute | `openspec/changes/{change_ref}/execute.md` |
| verify | `openspec/changes/{change_ref}/verification.md` |
| archive | `openspec/changes/{change_ref}/archive.md`（mv 后位于 `openspec/changes/archive/YYYY-MM-DD-{change_ref}/archive.md`） |

#### Scenario: change_ref 展开

- **WHEN** issue identifier 为 `TES-5`
- **THEN** `{change_ref}` SHALL 为 `tes-5`
- **AND** clarify 产物路径 SHALL 为 `openspec/changes/tes-5/proposal.md`

### Requirement: requires_pass 完成语义

当阶段配置 `requires_pass: true` 时，该阶段 SHALL 在产物文件存在且 YAML front matter 含 `status: pass` 时视为完成。当 `requires_pass` 省略或为 false 时，SHALL 在产物文件存在时视为完成。

#### Scenario: proposal_review 通过

- **WHEN** `proposal_review.md` 存在且 front matter 为 `status: pass`
- **THEN** proposal_review 阶段 SHALL 视为完成

#### Scenario: proposal_review 未通过

- **WHEN** `proposal_review.md` 存在且 front matter 为 `status: fail`
- **THEN** proposal_review 阶段 SHALL 视为未完成

#### Scenario: clarify 仅需存在

- **WHEN** `proposal.md` 存在（不要求 status）
- **THEN** clarify 阶段 SHALL 视为完成

### Requirement: 有序阶段依赖

`workflow.phases` SHALL 为有序列表。第 N 阶段成为 effective phase 前，所有序号小于 N 的阶段 SHALL 已满足各自完成语义。

#### Scenario: tasks 缺失不可 execute

- **WHEN** `tasks.md` 不存在
- **THEN** effective phase SHALL NOT 为 execute、verify 或 archive

#### Scenario: plan 前需 review pass

- **WHEN** `proposal_review.md` 不存在或未 pass
- **THEN** effective phase SHALL NOT 为 plan 或之后阶段

### Requirement: archive 先写产物再 mv

archive 阶段 handler SHALL 在 change 目录内写入 `archive.md`（含 `status: pass`）后再将 change 目录 mv 至 `openspec/changes/archive/`。workflow done 判定 SHALL 在 archive 路径或 active change 路径下找到 pass 的 `archive.md`。

#### Scenario: 归档后仍可找到 archive.md

- **WHEN** openspec archive mv 已完成
- **THEN** `openspec/changes/archive/YYYY-MM-DD-{change_ref}/archive.md` SHALL 存在且 status 为 pass
