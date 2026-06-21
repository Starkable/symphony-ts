## ADDED Requirements

### Requirement: BCS assignee JQL 验证

系统 SHALL 在 `pms:verify-jql` 中提供名为 `bcs-assignee-in-progress` 的验证 case，JQL 为：

`project = "{project}" AND status = "In Progress" AND assignee in ("{assignee}") ORDER BY updated ASC`

其中 `{project}` 默认 `BCS`，`{assignee}` 来自 WORKFLOW 或环境变量 `PMS_VERIFY_ASSIGNEE`（默认 `shenxianghong_wb`）。

#### Scenario: assignee JQL 语法合法

- **WHEN** 运行 `pnpm pms:verify-jql` 且 OAuth 有效
- **THEN** case `bcs-assignee-in-progress` 的 HTTP 状态为 200
- **AND** 报告记录 `ok: true`（即使 `total` 为 0）

#### Scenario: assignee JQL 语法非法

- **WHEN** assignee 或 status 名在 PMS 实例中不存在导致 JQL 400
- **THEN** 报告记录 `ok: false` 与 `errorBody` 摘要
- **AND** CLI 退出码反映至少一个核心 case 失败

### Requirement: BCS 目标状态 JQL 合法性验证

系统 SHALL 提供独立 verify case 验证以下 status 字符串在 BCS 项目中是否为合法 JQL 值（HTTP 200 即可，不要求有匹配工单）：

- `In Progress`
- `开发暂停`
- `已提测`

#### Scenario: 开发暂停 status JQL 合法

- **WHEN** 运行 verify 且 case `bcs-status-开发暂停` 执行 search
- **THEN** HTTP 状态为 200 或明确记录 400 与 errorMessages

#### Scenario: 已提测 status JQL 合法

- **WHEN** 运行 verify 且 case `bcs-status-已提测` 执行 search
- **THEN** HTTP 状态为 200 或明确记录 400 与 errorMessages

### Requirement: JQL status 名与返回展示名对照

当 `bcs-in-progress` 或 `bcs-assignee-in-progress` case 的 `total > 0` 时，系统 SHALL 在报告中记录首条 issue 的 `fields.status.name` 为 `returnedStatusName`，并与 JQL 使用的 status 字符串并列。

#### Scenario: 记录 status 展示名

- **WHEN** assignee JQL case 返回至少一条 issue
- **THEN** 报告包含 `jqlStatusName`（如 `In Progress`）与 `returnedStatusName`（如 `进行中` 或相同字符串）

### Requirement: BCS 项目 status 全集探测

`pms:probe` SHALL 调用 `GET /rest/api/2/project/{projectKey}/statuses` 并将各 issuetype 下的 status 名列表写入报告 `projectStatuses`。

#### Scenario: 成功列出项目 status

- **WHEN** 运行 `pnpm pms:probe` 且 project 为 BCS
- **THEN** 报告 `projectStatuses` 非空
- **AND** 包含「产品需求」或等价 issuetype 的 status 列表（若 API 返回 issuetype 名）

### Requirement: Issue transition 列表探测

给定 issue key（CLI 参数或 `PMS_PROBE_ISSUE_KEY`），`pms:probe` SHALL 调用 `GET /rest/api/2/issue/{key}/transitions` 并将每条 transition 的 `id`、`name`、`to.name` 写入报告。

#### Scenario: 列出 In Progress 工单的可用 transition

- **WHEN** probe issue 当前 status 为 In Progress（或等价展示名）
- **THEN** 报告 `transitions` 数组包含可用流转动作
- **AND** 可人工或脚本检查是否存在目标名含「开发暂停」或「已提测」的 transition

#### Scenario: 未提供 issue key

- **WHEN** 未设置 probe issue key
- **THEN** transition 探测标记为 `skipped: true`
- **AND** 其余只读探测（statuses、JQL verify）仍执行

### Requirement: Issue 评论读取探测

`pms:probe` SHALL 对指定 issue 调用 `GET /rest/api/2/issue/{key}/comment` 并记录 HTTP 状态与评论条数。

#### Scenario: 成功读取评论

- **WHEN** OAuth 用户对 issue 有读权限
- **THEN** 报告 `comments.ok` 为 true
- **AND** 记录 `comments.count`

#### Scenario: 无读评论权限

- **WHEN** API 返回 401 或 403
- **THEN** 报告 `comments.ok` 为 false 并记录 status

### Requirement: 可选写探测（显式 opt-in）

默认情况下 probe MUST NOT 写入 PMS。仅当传入 `--allow-write` 且指定 `--probe-issue-key` 时，MAY 执行：

- POST 测试评论（body 含 `[Symphony Probe]` 前缀）
- POST transition（仅当同时传入 `--transition-to <statusName>`）

#### Scenario: 默认不写 PMS

- **WHEN** 运行 `pnpm pms:probe` 无 `--allow-write`
- **THEN** 报告 `writeProbe.skipped` 为 true
- **AND** 不调用 comment POST 或 transition POST

#### Scenario: 显式写评论探测

- **WHEN** 运行 `pnpm pms:probe --allow-write --probe-issue-key BCS-xxxx`
- **THEN** 尝试 POST 测试评论
- **AND** 报告 `writeProbe.commentOk` 反映结果

### Requirement: 统一验证报告输出

系统 SHALL 将 BCS 集成验证结果写入 `tmp/pms-bcs-verify-report.json`，包含时间戳、project、assignee、jqlCases、projectStatuses、transitions、comments、writeProbe 字段。

#### Scenario: 报告文件生成

- **WHEN** verify-jql 与 probe 均执行完毕
- **THEN** `tmp/pms-bcs-verify-report.json` 存在且为合法 JSON
- **AND** 文档说明如何解读各字段

### Requirement: 单元测试不依赖 live PMS

新增 CLI 逻辑 SHALL 有 Vitest 覆盖（mock `authenticatedFetch` / `fetch`），验证 case 构建、报告序列化、flag 解析；live PMS 联调通过 package script 手动执行。

#### Scenario: mock 测试通过

- **WHEN** 运行 `pnpm test` 
- **THEN** `tests/cli/pms-probe.test.ts` 与扩展的 verify-jql 测试通过
