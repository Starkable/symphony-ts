## ADDED Requirements

### Requirement: Workpad 阶段状态机

Policy 工作流 SHALL 使用 `.symphony/workpad.md` 作为流程真相源，并 SHALL 包含 `Phase` 字段，取值为以下之一：`clarify`、`blocked`、`plan`、`proposal_review`、`execute`、`verify`、`archive`、`submit`、`handoff`。

#### Scenario: 新 issue 首次 dispatch

- **WHEN** workspace 中不存在 workpad 或 Phase 未设置
- **THEN** agent SHALL 初始化 workpad 且 Phase SHALL 为 `clarify`

#### Scenario: Phase 驱动 turn 行为

- **WHEN** agent 开始任意 turn
- **THEN** agent SHALL 读取 workpad Phase 并 SHALL 仅执行该 Phase 允许的动作

### Requirement: C0 澄清硬门禁

在 Phase 为 `clarify` 或 `blocked` 时，agent MUST NOT 修改产品代码（包括但不限于 `src/`、`tests/`、应用配置中的实现性变更），MUST NOT 进入 `execute` Phase，MUST NOT 创建实现性 git commit。

#### Scenario: 澄清未完成时禁止写代码

- **WHEN** Workpad 中 `Clarification` checklist 存在未勾选项或存在未解决的高影响 unknown
- **THEN** agent MUST NOT 修改 `src/` 或 `tests/` 下的文件

#### Scenario: 澄清完成可进入计划

- **WHEN** `Clarification` checklist 全部勾选且无 open 的高影响 unknown
- **THEN** agent MAY 将 Phase 设为 `plan` 并 MAY 仅更新 Workpad 中的 Plan/AC/Validation

### Requirement: 澄清暂挂 blocked

当信息缺失且不可安全推断时，agent SHALL 将 Phase 设为 `blocked`，SHALL 在 Workpad Notes 写入 `[CLARIFY]` 前缀问题，并 SHALL 正常结束 turn（不得 abnormal exit 以触发 failure backoff）。

#### Scenario: 不可推断时暂挂

- **WHEN** 高影响需求信息缺失且无法从代码 convention 安全推断
- **THEN** Phase SHALL 变为 `blocked` 且 turn SHALL 正常结束

#### Scenario: blocked 唤醒

- **WHEN** Workpad Notes 显示人工已回答 `[CLARIFY]` 且 Phase 被设为 `clarify`
- **THEN** agent SHALL 继续澄清流程

### Requirement: 一对一需求绑定

每个 workpad SHALL 包含唯一 `ChangeRef` 标识单一需求/ticket，且 SHALL NOT 在同一 Plan 内合并多个独立需求。

#### Scenario: 单需求绑定

- **WHEN** agent 创建或更新 workpad Meta
- **THEN** `ChangeRef` SHALL 对应且仅对应一个需求标识

#### Scenario: scope 膨胀处理

- **WHEN** 发现超出当前需求范围的额外工作
- **THEN** agent SHALL 在 Notes 记录 follow-up 建议且 SHALL NOT 扩展当前 Plan scope

### Requirement: 提案评审 Subagent

进入 `proposal_review` Phase 时，agent SHOULD 启动 readonly Proposal Reviewer Subagent，对照需求与 Workpad Plan/AC 产出 `REVIEW_REPORT`（pass 或 gap 列表）。

#### Scenario: 评审通过进入执行

- **WHEN** `REVIEW_REPORT` 为 pass 或所有 gap 已在 Workpad 中修复
- **THEN** Phase MAY 设为 `execute`

#### Scenario: 评审未通过

- **WHEN** `REVIEW_REPORT` 列出未修复 gap
- **THEN** agent SHALL 仅更新 Workpad Plan/AC 且 Phase SHALL 保持 `proposal_review`

### Requirement: QA Verifier Subagent 硬门禁

进入 `verify` Phase 时，agent MUST 启动 readonly QA Verifier Subagent 执行 Workpad Validation 中的命令；主 agent MUST NOT 自行声明验证通过。

#### Scenario: 验证通过方可归档

- **WHEN** Subagent 产出 `VERIFICATION_REPORT: PASS` 且所有 Validation 项有证据
- **THEN** Phase MAY 设为 `archive`

#### Scenario: 验证失败

- **WHEN** Subagent 产出 `VERIFICATION_REPORT: FAIL`
- **THEN** Phase SHALL 设为 `execute` 且 Notes SHALL 包含失败命令与输出摘要

#### Scenario: 主 agent 不得绕过 Subagent

- **WHEN** 不存在 `VERIFICATION_REPORT: PASS`
- **THEN** agent MUST NOT 将 Phase 设为 `archive` 或 `submit`

### Requirement: 验证失败默认回执行

当验证失败原因为实现未满足已澄清的 AC 时，Phase SHALL 设为 `execute`，SHALL NOT 回退到 `clarify`。

#### Scenario: 测试失败回执行

- **WHEN** 测试或 AC 检查失败且 Plan/AC 仍与已澄清需求一致
- **THEN** Phase SHALL 为 `execute`

#### Scenario: Plan 错误例外

- **WHEN** 失败原因系 Plan/AC 与需求不一致（非实现 bug）
- **THEN** Phase MAY 为 `plan` 或 `proposal_review` 且 SHALL NOT 自动设为 `clarify`

### Requirement: Cursor CLI Policy 配置

示例 WORKFLOW 与文档 SHALL 默认配置 `agent.harness: cursor` 且 `harnesses.cursor.mode: force`，并 SHALL 说明 `reuse_policy: per_issue` 与 workpad 续跑关系。

#### Scenario: Cursor harness 默认值

- **WHEN** 用户采用仓库提供的 Policy WORKFLOW 模板
- **THEN** front matter SHALL 指定 cursor harness 且 mode SHALL 为 `force`

### Requirement: 文档与暂缓项

项目 SHALL 提供 `docs/symphony-agent-workflow.md` 描述完整 Policy 流程；README SHALL 含指向该文档的 Roadmap 短链；暂缓项（平台对接、orchestrator 门控等）SHALL 记录在 workflow 文档的 TODO 节。

#### Scenario: 文档可发现

- **WHEN** 贡献者阅读 README Roadmap
- **THEN** 其 SHALL 能找到 `docs/symphony-agent-workflow.md` 链接

#### Scenario: 暂缓项有记录

- **WHEN** 实现范围排除 orchestrator 或需求平台
- **THEN** 对应能力 SHALL 出现在 workflow 文档 TODO 列表
