## ADDED Requirements

### Requirement: Active 列表排除已归档 reason

`GET /api/v1/workflows?status=active` 的响应 SHALL 包含：

- 当前 orchestrator `running` 中的全部工单
- Artifact Store 中 `meta.archived_reason` 为空或 null **且** `meta.terminal_phase` 为空或 null 的工单

SHALL NOT 包含仅因 startup terminal cleanup 写入且已设置 `archived_reason: "pms_terminal_cleanup"` 的工单。

#### Scenario: 终态 cleanup 归档不进 Active

- **WHEN** store 中某工单 `archived_reason` 为 `"pms_terminal_cleanup"` 且不在 running
- **THEN** `GET /api/v1/workflows?status=active` 响应 SHALL NOT 包含该工单

#### Scenario: Running 工单始终在 Active

- **WHEN** 某工单在 orchestrator running 状态中
- **THEN** `GET /api/v1/workflows?status=active` 响应 SHALL 包含该工单，无论 `archived_reason` 值

#### Scenario: 进行中 store 条目在 Active

- **WHEN** store 中工单 `archived_reason` 为空且 `terminal_phase` 为空且不在 running
- **THEN** `GET /api/v1/workflows?status=active` 响应 SHALL 包含该工单

### Requirement: Archived 列表包含 archived_reason

`GET /api/v1/workflows?status=archived` 的响应 SHALL 包含满足以下**任一**条件、且不在 running 的工单：

- `meta.archived_reason` 非空
- `meta.terminal_phase` 为 `done` 或 `failed`

#### Scenario: pms_terminal_cleanup 进 History

- **WHEN** store 中工单 `archived_reason` 为 `"pms_terminal_cleanup"` 且不在 running
- **THEN** `GET /api/v1/workflows?status=archived` 响应 SHALL 包含该工单

#### Scenario: OpenSpec 终态进 History

- **WHEN** store 中工单 `terminal_phase` 为 `done` 且不在 running
- **THEN** `GET /api/v1/workflows?status=archived` 响应 SHALL 包含该工单

#### Scenario: 活跃进行中不进 History

- **WHEN** 工单在 running 或 `archived_reason` 为空且 `terminal_phase` 为空
- **THEN** `GET /api/v1/workflows?status=archived` 响应 SHALL NOT 包含该 running 工单

### Requirement: 摘要含 archived_reason

Workflow 列表与详情 API 返回的 meta 合并视图 SHALL 暴露 `archived_reason` 字段（若存在），供 UI 区分归档原因。

#### Scenario: 列表返回 archived_reason

- **WHEN** 客户端请求 `GET /api/v1/workflows?status=archived`
- **THEN** 含 `archived_reason` 的条目 SHALL 在响应中包含该字段
