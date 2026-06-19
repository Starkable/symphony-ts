## ADDED Requirements

### Requirement: V1.1 阶段 skill 集合

Bundle `skills/` SHALL 包含以下 symphony 阶段 skill（英文 slug）：`symphony-v1-policy`、`symphony-clarify`、`symphony-proposal-review`、`symphony-plan`、`symphony-verify`。

#### Scenario: proposal_review 使用英文 slug

- **WHEN** 列出 bundle skills
- **THEN** SHALL 存在 `symphony-proposal-review`
- **AND** SHALL NOT 存在 `symphony-提案评审` 目录

#### Scenario: 横切 policy 在 skills 内

- **WHEN** install 完成
- **THEN** `symphony-v1-policy` SHALL 位于 `workspace/.cursor/skills/symphony-v1-policy/`
- **AND** SHALL NOT 位于 `workspace/.agents/skills/`

### Requirement: skill 内容完整度

每个 symphony 阶段 skill 的 `SKILL.md` SHALL 包含：YAML frontmatter（`name`、`description` 中文）、**Input**、前置条件、**Steps**（编号步骤）、**输出格式**（严格模板）、**Guardrails**、与相关 `openspec-*` skill 的分工说明；正文步骤说明 SHALL 为简体中文。

#### Scenario: 与 openspec skill 同构

- **WHEN** 对比 `symphony-proposal-review/SKILL.md` 与 `openspec-continue-change/SKILL.md`
- **THEN** symphony skill SHALL 包含 Steps 与 Guardrails 章节
- **AND** 行数 SHALL 明显多于仅含「适用/动作/禁止」三段的简略 skill（目标 ≥ 60 行或等价完整度）

#### Scenario: 评审 skill 吸收原 subagent 检查项

- **WHEN** agent 在 `proposal_review` 阶段读取 `symphony-proposal-review`
- **THEN** skill SHALL 要求对照 proposal 的范围、验收性、风险、ChangeRef 绑定
- **AND** SHALL 要求输出 `REVIEW_REPORT: PASS|FAIL` 与 `.symphony/workflow/phases/proposal_review/` 报告文件

#### Scenario: verify skill 定义 Validation 执行

- **WHEN** agent 在 `verify` 阶段读取 `symphony-verify`
- **THEN** skill SHALL 要求执行 `tasks.md` 末尾 `## Validation` 命令
- **AND** SHALL 要求输出 `VERIFICATION_REPORT: PASS|FAIL` 与验证报告文件

### Requirement: 移除 legacy agents skills

symphony-ts 仓库 SHALL 删除 `.agents/skills/` 目录（含 commit、push、proposal-review-subagent、qa-verify-subagent）；V1.1 文档 SHALL NOT 要求复制 `.agents/skills`。

#### Scenario: 文档无 agents 路径

- **WHEN** 阅读 `docs/symphony-agent-workflow.md` V1.1 Skills 索引
- **THEN** SHALL NOT 将出现「必须从 `.agents/skills` 拷贝」作为 V1.1 默认路径

### Requirement: openspec 与 symphony skill 分工

| Phase | symphony skill | openspec skill |
|-------|----------------|----------------|
| clarify | symphony-clarify | openspec-explore, openspec-new-change |
| proposal_review | symphony-proposal-review | （无 CLI） |
| plan | symphony-plan | openspec-continue-change |
| execute | — | openspec-apply-change |
| verify | symphony-verify | — |
| archive | — | openspec-archive-change |
| 横切 | symphony-v1-policy | — |

#### Scenario: plan 禁止默认 ff-change

- **WHEN** Phase 为 `plan` 且 agent 读取 `symphony-plan`
- **THEN** skill SHALL 禁止将 `openspec-ff-change` 作为默认路径
- **AND** SHALL 指向 `openspec-continue-change` 直至 `tasks.md` apply-ready
