## ADDED Requirements

### Requirement: WORKFLOW assignee 过滤

系统 SHALL 支持 WORKFLOW 可选字段 `tracker.assignee`（字符串或字符串列表）。当配置非空时，candidate issues JQL SHALL 追加 `assignee in (...)` 子句；未配置时不追加。

环境变量 `PMS_TRACKER_ASSIGNEE`（逗号分隔）SHALL 在配置解析时覆盖 WORKFLOW 中的 assignee 值。

#### Scenario: 配置 assignee 时 JQL 含 assignee 子句

- **WHEN** `tracker.assignee` 为 `shenxianghong_wb` 且 `active_states` 含 `In Progress`
- **THEN** 生成的 candidate JQL 包含 `assignee in ("shenxianghong_wb")`

#### Scenario: 未配置 assignee 时不过滤经办人

- **WHEN** `tracker.assignee` 为空且未设置 `PMS_TRACKER_ASSIGNEE`
- **THEN** candidate JQL 不包含 `assignee in`

#### Scenario: 环境变量覆盖 WORKFLOW

- **WHEN** WORKFLOW 未配置 assignee 且 `PMS_TRACKER_ASSIGNEE=alice_wb,bob_wb`
- **THEN** candidate JQL 包含 `assignee in ("alice_wb", "bob_wb")`

### Requirement: assignee poll 排序

当 assignee 过滤生效时，candidate issues JQL SHALL 使用 `ORDER BY updated ASC`；否则 SHALL 保持 `ORDER BY created ASC`。

#### Scenario: 有 assignee 时按 updated 升序

- **WHEN** assignee 过滤已启用
- **THEN** JQL 以 `ORDER BY updated ASC` 结尾

### Requirement: Poll 时读取 PMS 备注

Poll 获取 candidate issues 后，系统 SHALL 对每条 issue 调用 `GET /rest/api/2/issue/{key}/comment`，解析评论列表（作者、时间、body 纯文本）。

#### Scenario: 成功读取备注

- **WHEN** issue 存在且 comment API 返回 200
- **THEN** 该 issue 关联的评论列表可用于后续 prompt 构建

#### Scenario: 单条 issue 读备注失败不阻塞 poll

- **WHEN** 某 issue 的 comment GET 失败
- **THEN** 该 issue 仍以空评论列表参与 dispatch，且记录 warn 日志

### Requirement: 备注注入 Agent prompt

构建 Agent prompt 时，系统 SHALL 在工单 description 之外追加 PMS 历史备注摘要（默认可配置最近 10 条，按时间升序或降序文档约定）。

#### Scenario: 有备注时 prompt 含备注节

- **WHEN** issue 有至少一条 PMS 备注
- **THEN** 渲染后的 prompt 包含可读备注文本

#### Scenario: 无备注时不追加空节

- **WHEN** issue 评论列表为空
- **THEN** prompt 不因备注产生额外空段落

### Requirement: Issue 模型携带备注摘要

系统 SHALL 扩展 issue 表示（或等价 poll 上下文）以携带 PMS 备注数据，供 orchestrator 与 prompt-builder 使用，且不破坏 Linear tracker 路径。

#### Scenario: PMS poll 后 issue 含 comments 字段

- **WHEN** PMS tracker 完成 fetchCandidateIssues
- **THEN** 返回的 issue 对象包含结构化 comments 数组或等价字段
