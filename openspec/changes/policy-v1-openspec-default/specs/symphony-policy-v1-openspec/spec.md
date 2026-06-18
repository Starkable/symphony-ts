## ADDED Requirements

### Requirement: V1 模式标识

Workpad Meta SHALL 包含 `Mode: v1-openspec`，且 V1 运行 SHALL 遵循本 capability 与 WORKFLOW 中 V1 OpenSpec 默认模式章节。

#### Scenario: 新 issue 初始化 workpad

- **WHEN** agent 首次为 issue 创建 workpad
- **THEN** Meta SHALL 包含 `Mode: v1-openspec` 且 Phase SHALL 为 `clarify`

### Requirement: ChangeRef 与 OpenSpec change 绑定

`ChangeRef` SHALL 为 `issue.identifier` 的 kebab-case 规范化字符串，且 SHALL 与 `openspec/changes/<ChangeRef>/` 目录一一对应。

#### Scenario: 创建 OpenSpec change

- **WHEN** agent 进入 `plan` Phase 且 `openspec/changes/<ChangeRef>/` 不存在
- **THEN** agent SHALL 执行 `openspec new change "<ChangeRef>"` 且 SHALL NOT 通过 AskUserQuestion 让用户选择 change 名称

#### Scenario: 续跑已有 change

- **WHEN** `openspec/changes/<ChangeRef>/` 已存在
- **THEN** agent SHALL 仅在该 change 目录上继续 propose/apply/archive 操作

### Requirement: Workpad 瘦身

V1 模式下 workpad SHALL NOT 重复存储 Plan、Acceptance Criteria、Validation 正文；上述内容 SHALL 以 `openspec/changes/<ChangeRef>/` 内制品为权威。

#### Scenario: plan 阶段更新制品

- **WHEN** Phase 为 `plan` 且 agent 完成 OpenSpec 制品创建
- **THEN** agent SHALL 更新 openspec 制品且 SHALL 仅更新 workpad Gate Log（P1）而非复制 Plan 全文到 workpad

### Requirement: V1 Phase 状态机

V1 SHALL 使用 Phase 序列：`clarify`、`plan`、`proposal_review`、`execute`、`verify`、`archive`、`done`、`failed`。V1 SHALL NOT 使用 `submit`、`handoff` 作为必经 Phase。

#### Scenario: 正常完成

- **WHEN** `archive` Phase 完成且 openspec archive 成功
- **THEN** Phase SHALL 设为 `done`

#### Scenario: 禁止跳过 proposal_review

- **WHEN** Phase 为 `plan` 且 P1 已通过
- **THEN** agent SHALL 将 Phase 设为 `proposal_review` 且 SHALL NOT 直接进入 `execute`

### Requirement: Phase 默认 OpenSpec 实现

| Phase | 默认实现 |
|-------|----------|
| clarify | `openspec-explore` |
| plan | `openspec-ff-change`（或 WORKFLOW 指定的 propose） |
| execute | `openspec-apply-change` |
| archive | `openspec-archive-change`（V1 不同步 main spec） |

#### Scenario: clarify 使用 explore

- **WHEN** Phase 为 `clarify` 且 C0 未通过
- **THEN** agent SHALL 使用 explore 读代码与 ticket 且 SHALL NOT 调用 `openspec new change` 或修改 `src/`

#### Scenario: execute 使用 apply

- **WHEN** Phase 为 `execute` 且 P2 已通过
- **THEN** agent SHALL 按 `openspec-apply-change` 实现 `tasks.md` 中待办项

### Requirement: 全自动澄清失败

V1 SHALL NOT 使用 `blocked` 等待人工回复。高影响 unknown 且无法安全推断时，agent SHALL 将 Phase 设为 `failed` 并在 Notes 写入 `CLARIFY_BLOCKED: <原因>`，且 SHALL 正常结束 turn。

#### Scenario: 澄清不可行

- **WHEN** 高影响信息缺失且无法写入 Assumptions 安全推断
- **THEN** Phase SHALL 为 `failed` 且 agent MUST NOT 修改 `src/` 或 `tests/`

### Requirement: proposal_review 主 agent 自审

进入 `proposal_review` 时，主 agent SHALL 读取 `openspec/changes/<ChangeRef>/` 下 proposal、specs、design、tasks，并在 Notes 输出 `REVIEW_REPORT: PASS` 或 `REVIEW_REPORT: FAIL`（含 Gaps 列表）。

#### Scenario: 评审通过

- **WHEN** Notes 含 `REVIEW_REPORT: PASS`
- **THEN** Phase MAY 设为 `execute`

#### Scenario: 评审未通过

- **WHEN** Notes 含 `REVIEW_REPORT: FAIL` 且存在未修复 Gaps
- **THEN** agent SHALL 仅修改 openspec 制品且 Phase SHALL 为 `plan` 或 `proposal_review`

### Requirement: verify 主 agent 单路径验证

进入 `verify` 时，主 agent SHALL 执行 `openspec/changes/<ChangeRef>/tasks.md` 末尾 `## Validation` 所列命令，并在 Notes 输出 `VERIFICATION_REPORT: PASS` 或 `VERIFICATION_REPORT: FAIL`。

#### Scenario: 验证通过

- **WHEN** 所有 Validation 命令 exit 0 且 Notes 含 `VERIFICATION_REPORT: PASS`
- **THEN** Phase MAY 设为 `archive`

#### Scenario: 验证失败回执行

- **WHEN** Notes 含 `VERIFICATION_REPORT: FAIL`
- **THEN** Phase SHALL 为 `execute` 且 SHALL NOT 回退到 `clarify`（除非 Notes 标明 `REOPEN_CLARIFY`）

### Requirement: tasks.md Validation 段

每个 V1 change 的 `tasks.md` SHALL 包含末尾章节 `## Validation`，列出至少一条可执行验证命令（如 `pnpm test`）。

#### Scenario: verify 读取 Validation

- **WHEN** Phase 为 `verify`
- **THEN** agent SHALL 以 `tasks.md` 的 `## Validation` 为验证命令权威来源

### Requirement: WORKFLOW 无人值守覆盖

采用 V1 的 WORKFLOW prompt SHALL 声明：禁止 AskUserQuestion 选择 change；`ChangeRef` 由 `issue.identifier` 推导；每 turn 先读 workpad Phase。

#### Scenario: Symphony dispatch

- **WHEN** orchestrator 向 agent 发起 turn
- **THEN** agent SHALL 读取 `.symphony/workpad.md` Phase 并 SHALL 仅执行该 Phase 允许动作
