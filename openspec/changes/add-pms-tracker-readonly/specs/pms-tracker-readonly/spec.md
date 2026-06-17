## ADDED Requirements

### Requirement: Tracker 工厂按 kind 实例化

系统 SHALL 提供 `createIssueTracker(resolvedConfig): IssueTracker`，根据 `tracker.kind` 返回对应 adapter 实例。

#### Scenario: Linear kind 不变

- **WHEN** `tracker.kind` 为 `linear` 且配置有效
- **THEN** 系统 SHALL 返回与变更前行为等价的 Linear adapter

#### Scenario: PMS kind 实例化

- **WHEN** `tracker.kind` 为 `pms` 且 PMS 凭据配置有效
- **THEN** 系统 SHALL 返回 PMS 只读 adapter 实例

#### Scenario: 不支持的 kind

- **WHEN** `tracker.kind` 不是 `linear` 或 `pms`
- **THEN** dispatch 校验 SHALL 失败且错误码 SHALL 为 `unsupported_tracker_kind`

### Requirement: PMS OAuth 凭据配置

当 `tracker.kind` 为 `pms` 时，系统 SHALL 从 WORKFLOW 的 `tracker.oauth` 对象解析以下字段：`access_token`、`access_token_secret`、`rsa_private_key_path`；SHALL 支持明文值、`$ENV_VAR` 引用、以及 canonical 环境变量 fallback（`PMS_OAUTH_ACCESS_TOKEN`、`PMS_OAUTH_ACCESS_TOKEN_SECRET`、`PMS_JIRA_KEY_PATH`）。

#### Scenario: 环境变量注入

- **WHEN** WORKFLOW 中 `oauth.access_token` 为 `$PMS_OAUTH_ACCESS_TOKEN` 且进程环境已设置该变量
- **THEN** 解析后的凭据 SHALL 可用于 PMS API 调用

#### Scenario: 凭据缺失拒绝 dispatch

- **WHEN** `tracker.kind` 为 `pms` 且 OAuth token、secret 或 RSA 私钥路径任一缺失
- **THEN** `validateDispatchConfig` SHALL 失败且错误码 SHALL 为 `tracker_credentials_missing`

### Requirement: PMS dispatch 鉴权验证

当 `tracker.kind` 为 `pms` 且 `oauth.validate_on_dispatch` 不为 `false` 时，系统在 dispatch 前 SHALL 调用 `GET /rest/api/2/myself` 验证 OAuth 签名有效性。

#### Scenario: 鉴权成功

- **WHEN** `/myself` 返回 HTTP 200
- **THEN** dispatch 校验 SHALL 通过

#### Scenario: 鉴权失败

- **WHEN** `/myself` 返回 HTTP 401 或 403
- **THEN** dispatch 校验 SHALL 失败且错误 SHALL 标明 PMS 鉴权失败

### Requirement: PMS 候选工单拉取

PMS adapter SHALL 实现 `fetchCandidateIssues()`：查询指定 `project_slug`（Jira projectKey）下、状态属于 `active_states` 的工单，并 SHALL 归一化为 domain `Issue` 模型。

#### Scenario: 按 active_states 过滤

- **WHEN** `project_slug` 为 `BASELINEREQ` 且 `active_states` 包含 `待开发`
- **THEN** adapter SHALL 使用 JQL `project = "BASELINEREQ" AND status in ("待开发", ...)` 查询并返回归一化 Issue 列表

#### Scenario: 分页拉取

- **WHEN** 匹配工单数超过单页上限
- **THEN** adapter SHALL 分页请求直至无更多结果

### Requirement: PMS 按状态批量查询

PMS adapter SHALL 实现 `fetchIssuesByStates(stateNames)`，用于启动时 terminal workspace 清理。

#### Scenario: 空状态列表

- **WHEN** `stateNames` 为空数组
- **THEN** SHALL 返回空数组且不发起 API 请求

#### Scenario: terminal 状态查询

- **WHEN** `stateNames` 为 `["已关闭", "已取消"]`
- **THEN** adapter SHALL 返回对应状态下、属于配置 projectKey 的 Issue 列表

### Requirement: PMS 运行中状态刷新

PMS adapter SHALL 实现 `fetchIssueStatesByIds(issueIds)`，按 Jira numeric id 刷新工单状态快照。

#### Scenario: 刷新运行中 worker

- **WHEN** orchestrator 传入一个或多个 Jira numeric id
- **THEN** adapter SHALL 返回对应的 `IssueStateSnapshot`（含 `id`、`identifier`（key）、`state`）

#### Scenario: 空 id 列表

- **WHEN** `issueIds` 为空
- **THEN** SHALL 返回空数组

### Requirement: PMS Issue 归一化字段

PMS adapter 归一化后的 `Issue` SHALL 满足：`id` 为 Jira numeric id 字符串；`identifier` 为 issue key；`state` 为 `status.name`；`title` 为 `summary`；`url` 为 `{endpoint}/browse/{key}`；`blockedBy` 在一期 SHALL 为空数组。

#### Scenario: 标准字段映射

- **WHEN** Jira 返回 key 为 `BASELINEREQ-34606`、summary 为「优化登录流程」的工单
- **THEN** 归一化 Issue 的 `identifier` SHALL 为 `BASELINEREQ-34606` 且 `title` SHALL 为「优化登录流程」

### Requirement: PMS 只读边界

PMS adapter 在一期 SHALL NOT 提供评论、状态流转、建单等写操作；orchestrator SHALL NOT 因 `tracker.kind: pms` 而调用任何 tracker 写 API。

#### Scenario: 无写 API 暴露

- **WHEN** `tracker.kind` 为 `pms`
- **THEN** `IssueTracker` 接口 SHALL 仍仅包含三个读方法

#### Scenario: Codex 不注入 linear_graphql

- **WHEN** agent harness 为 codex 且 `tracker.kind` 为 `pms`
- **THEN** 系统 SHALL NOT 向 agent 注入 `linear_graphql` 工具
