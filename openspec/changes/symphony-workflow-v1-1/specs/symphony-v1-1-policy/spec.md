## ADDED Requirements

### Requirement: V1.1 阶段顺序

系统文档与 Dashboard SHALL 采用 V1.1 业务阶段顺序：`clarify` → `proposal_review` → `plan` → `execute` → `verify` → `archive`（不含终态 `done`/`failed` 作为时间线节点）。

#### Scenario: Dashboard 时间线顺序

- **WHEN** 用户打开 Workflow 详情页或 Active 卡片时间线
- **THEN** 六个业务阶段 SHALL 按 V1.1 顺序从左到右或从上到下展示
- **AND** `proposal_review` SHALL 出现在 `plan` 之前

#### Scenario: Phase id 保持稳定

- **WHEN** workpad Meta 写入 `Phase: proposal_review`
- **THEN** orchestrator 与 manifest SHALL 仍使用英文 phase id `proposal_review`
- **AND** 中文标签 SHALL 为「提案评审」

### Requirement: V1.1 Gate 语义

V1.1 Gate SHALL 定义如下过渡（**BREAKING**，与 V1 不同）：

| Gate | 过渡 |
|------|------|
| C0 | clarify → proposal_review |
| P2 | proposal_review → plan |
| P1 | plan → execute |
| V1 | verify → archive |

#### Scenario: C0 通过后进入评审

- **WHEN** workpad Gate Log 中 C0 为 pass 且 Phase 推进
- **THEN** 下一 Phase SHALL 为 `proposal_review`
- **AND** SHALL NOT 直接进入 `plan`

#### Scenario: P2 通过后进入规划

- **WHEN** Notes 含 `REVIEW_REPORT: PASS` 且 P2 为 pass
- **THEN** 下一 Phase SHALL 为 `plan`

#### Scenario: P1 通过后进入执行

- **WHEN** `openspec status` 显示 apply 所需制品完成且 P1 为 pass
- **THEN** 下一 Phase SHALL 为 `execute`

### Requirement: V1.1 Phase Skill 路由

Policy 文档 SHALL 规定 V1.1 每 Phase 允许的 Skill 动作；plan 阶段 SHALL NOT 默认使用 `openspec-ff-change` 一次生成全套制品。

#### Scenario: clarify 阶段

- **WHEN** Phase 为 `clarify`
- **THEN** agent MAY 使用 explore 类 skill 并 SHALL 产出或更新 `openspec/changes/<ChangeRef>/proposal.md` 需求描述
- **AND** SHALL NOT 调用 `openspec-apply-change`

#### Scenario: plan 阶段

- **WHEN** Phase 为 `plan`
- **THEN** agent SHALL 使用增量制品 skill（如 `openspec-continue-change`）直至 `tasks.md` 就绪
- **AND** SHALL NOT 使用 `openspec-ff-change` 作为默认路径

### Requirement: 合法回退

V1.1 SHALL 文档化至少以下回退路径。

#### Scenario: 评审失败回到澄清

- **WHEN** `REVIEW_REPORT: FAIL` 且需求理解根本错误
- **THEN** 下一 Phase MAY 为 `clarify` 且 Notes MAY 含 `REOPEN_CLARIFY`

#### Scenario: 验证失败回到执行

- **WHEN** `VERIFICATION_REPORT: FAIL` 且 tasks 仍正确
- **THEN** 下一 Phase SHALL 为 `execute`
