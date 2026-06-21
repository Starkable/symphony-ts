## 1. 配置与 JQL

- [x] 1.1 在 WORKFLOW schema / config-resolver 增加 `tracker.assignee`（string | string[]）及 `PMS_TRACKER_ASSIGNEE` env 覆盖
- [x] 1.2 扩展 `pms-jql.ts`：assignee 子句 + assignee 启用时 `ORDER BY updated ASC`
- [x] 1.3 更新 `examples/workflow-pms/WORKFLOW.md`：`assignee`、`terminal_states: [已提测]`、移除只读说明
- [x] 1.4 单测：`pms-jql.test.ts` / `config-resolver.test.ts` 覆盖 assignee 与排序

## 2. PMS 读备注

- [x] 2.1 实现 `listIssueComments`（GET comment，解析 body/author/created）
- [x] 2.2 扩展 `Issue` 或 PMS poll 上下文携带 `comments` 字段
- [x] 2.3 `fetchCandidateIssues` 后对 candidate 并行拉取 comment（失败降级为空 + warn log）
- [x] 2.4 `prompt-builder` 注入「PMS 备注」节（默认最近 10 条）
- [x] 2.5 单测：pms-client mock、prompt-builder 含备注渲染

## 3. PMS 写 API

- [x] 3.1 将 `findTransitionMatch` 从 cli 抽到 `src/tracker/pms/` 共享模块
- [x] 3.2 实现 `addIssueComment`、`listIssueTransitions`、`transitionIssue`
- [x] 3.3 单测：mock HTTP 覆盖 201/204 与错误路径

## 4. Workpad 信号解析

- [x] 4.1 实现 `parseWorkpadWritebackSignal(workpad)`：检测 `CLARIFY_BLOCKED` 与 `Phase=done`
- [x] 4.2 单测：workpad 样例覆盖 failed+CLARIFY、done、其他 phase

## 5. Orchestrator 写回

- [x] 5.1 在 worker 正常结束路径读取 workspace workpad 并解析写回信号
- [x] 5.2 实现 CLARIFY 路径：transition 暂停开发 + POST 备注（幂等：已开发暂停则 skip transition）
- [x] 5.3 实现 done 路径：transition 提测（不写备注）
- [x] 5.4 实现 pending 队列与 poll tick 重试；写失败不阻塞 dispatch
- [x] 5.5 结构化日志：issue id、action、HTTP status
- [x] 5.6 单测 / integration：mock tracker 验证写回调度与 pending

## 6. Status dispatch 兜底（按需）

- [x] 6.1 若 smoke 证实 `issue.state=进行中` 与 `active_states` 不匹配，增加 PMS status alias 或扩展比对
- [x] 6.2 单测：alias 映射 `In Progress` ↔ `进行中`

## 7. 文档

- [x] 7.1 更新 `docs/pms-field-mapping.md`：assignee、comments、写回矩阵
- [x] 7.2 更新 `docs/pms-tracker.md`：读写行为、pending 重试、测试分级运维说明
- [x] 7.3 更新 `docs/symphony-agent-workflow.md`（如需要）：orchestrator 写回与 Agent 边界

## 8. 验收

- [x] 8.1 `pnpm build && pnpm test` 全绿（PMS 相关测试全绿；Windows 上 Codex/路径类既有失败与本次 change 无关）
- [ ] 8.2 `pnpm pms:smoke examples/workflow-pms/WORKFLOW.md --limit 5` 验证 assignee 过滤与 state（需 OAuth 环境）
- [ ] 8.3 测试工单 manual e2e：模拟 workpad CLARIFY_BLOCKED → PMS 开发暂停+备注
- [ ] 8.4 测试工单 manual e2e：模拟 workpad Phase=done → PMS 已提测

## Validation

- [x] `pnpm test`（PMS / orchestrator 写回相关套件）
- [x] `pnpm lint`（本次变更文件）
- [x] `pnpm typecheck`
