## ADDED Requirements

### Requirement: PMS 写 API 客户端

`PmsTrackerClient` SHALL 提供：

- `addIssueComment(issueKey, body)` → `POST /rest/api/2/issue/{key}/comment`
- `transitionIssue(issueKey, transitionId)` → `POST /rest/api/2/issue/{key}/transitions` body `{ transition: { id } }`
- `listIssueTransitions(issueKey)` → `GET /rest/api/2/issue/{key}/transitions`

transition 目标匹配 SHALL 复用与 probe 一致的子串匹配规则（transition name 或 to.status name）。

#### Scenario: 写备注成功

- **WHEN** 调用 addIssueComment 且 OAuth 有写权限
- **THEN** HTTP 响应为 2xx

#### Scenario: transition 成功

- **WHEN** 调用 transitionIssue 且 transition id 对当前工单合法
- **THEN** HTTP 响应为 2xx

### Requirement: CLARIFY_BLOCKED 写回

当 worker 正常结束且 workspace `.symphony/workpad.md` 满足 `Phase=failed` 且 Notes 含 `CLARIFY_BLOCKED:` 时，orchestrator SHALL：

1. 匹配 transition **暂停开发**（目标态 开发暂停）并执行
2. POST 备注，body 含 CLARIFY_BLOCKED 相关说明（至少包含 Notes 中对应行）

写回 SHALL 由 orchestrator 执行，Agent SHALL NOT 直接调用 PMS 写 API。

#### Scenario: 澄清失败写回开发暂停与备注

- **WHEN** turn 正常结束且 workpad Phase 为 failed、Notes 含 `CLARIFY_BLOCKED: 需求不明确`
- **THEN** PMS 工单执行暂停开发 transition 且新增一条备注

#### Scenario: 已是开发暂停时跳过 transition

- **WHEN** 触发 CLARIFY_BLOCKED 写回但 issue 当前 state 已为开发暂停
- **THEN** 不重复执行 transition（可选仍写备注，实现按 design 幂等规则）

### Requirement: 归档成功写回已提测

当 worker 正常结束且 workpad `Phase=done` 时，orchestrator SHALL 匹配 transition **提测**（目标态 已提测）并执行，且 SHALL NOT 自动 POST 备注。

#### Scenario: done 写回已提测

- **WHEN** turn 正常结束且 workpad Phase 为 done
- **THEN** PMS 工单执行提测 transition 至已提测

#### Scenario: done 不写备注

- **WHEN** 归档成功写回已提测
- **THEN** 不调用 addIssueComment

### Requirement: 写回 best-effort 与 pending 重试

PMS 写回失败 SHALL NOT 导致 worker 失败或阻塞其他 issue 的 poll/dispatch。失败请求 SHALL 进入 pending 队列并在后续 tick best-effort 重试直至成功或人工干预。

#### Scenario: transition 失败不阻塞调度

- **WHEN** 提测 transition 返回 HTTP 400
- **THEN** orchestrator 记录错误并将该写回加入 pending，且下一 poll tick 仍可 dispatch 其他工单

#### Scenario: pending 重试成功

- **WHEN** pending 队列中存在失败写回且重试时 PMS 返回 2xx
- **THEN** 该项从 pending 移除

### Requirement: terminal_states 与 reconcile

WORKFLOW `terminal_states` 配置为 `[已提测]` 时，reconcile SHALL 在 issue 进入已提测后停止对应 worker（terminal_state）。

#### Scenario: 已提测停止 worker

- **WHEN** running issue 的 tracker state 刷新为已提测
- **THEN** orchestrator 发起 stop 且 reason 为 terminal_state

### Requirement: 写回结构化日志

每次 PMS 写回尝试（transition / comment）SHALL 记录 structured log，含 issue identifier、action 类型、HTTP status、错误摘要。

#### Scenario: 写回失败有日志

- **WHEN** addIssueComment 返回非 2xx
- **THEN** 日志含 issue_identifier 与 error 详情
