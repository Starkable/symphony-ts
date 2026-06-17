## 1. Tracker 工厂与配置骨架

- [x] 1.1 扩展 `WorkflowTrackerConfig` / `types.ts`：新增 `oauth` 子对象类型（access_token、access_token_secret、rsa_private_key_path、consumer_key、validate_on_dispatch）
- [x] 1.2 在 `defaults.ts` 增加 PMS 默认值（endpoint、consumer_key、page size、network timeout）
- [x] 1.3 在 `config-resolver.ts` 解析 `tracker.oauth` 字段，实现 `$ENV` + canonical env fallback
- [x] 1.4 新增 `src/tracker/tracker-factory.ts`：`createIssueTracker(config)` 按 kind 分发
- [x] 1.5 修改 `runtime-host.ts`：用 factory 替代 `createLinearTrackerFromConfig` 硬编码
- [x] 1.6 更新 `validateDispatchConfig`：`linear` 与 `pms` 分支校验；`pms` 不要求 `api_key`
- [x] 1.7 补充 `tests/config/config-resolver.test.ts`：PMS oauth 解析与校验用例

## 2. PMS OAuth 签名模块

- [x] 2.1 新增 `src/tracker/pms/pms-oauth.ts`：OAuth 1.0a RSA-SHA1 签名与 Authorization 头构建
- [x] 2.2 实现 RSA 私钥从路径读取（支持 `~` 展开）及错误处理
- [x] 2.3 新增 `tests/tracker/pms/pms-oauth.test.ts`：签名格式与边界用例（mock 密钥）

## 3. PMS REST 客户端与 JQL

- [x] 3.1 新增 `src/tracker/pms/pms-jql.ts`：候选工单、按状态、按 id 三类 JQL 构建
- [x] 3.2 新增 `src/tracker/pms/pms-client.ts`：`PmsTrackerClient` 实现 `IssueTracker` 三方法
- [x] 3.3 实现 `POST /rest/api/2/search` 分页与 `GET /rest/api/2/myself` 鉴权探测
- [x] 3.4 新增 `src/tracker/pms/pms-normalize.ts`：Jira JSON → domain `Issue` / `IssueStateSnapshot`
- [x] 3.5 新增 `tests/tracker/pms/pms-jql.test.ts`
- [x] 3.6 新增 `tests/tracker/pms/pms-normalize.test.ts`
- [x] 3.7 新增 `tests/tracker/pms/pms-client.test.ts`（mock fetch，覆盖三方法与错误路径）

## 4. 集成与 Factory 测试

- [x] 4.1 新增 `tests/tracker/tracker-factory.test.ts`：linear / pms / unsupported kind
- [x] 4.2 确认 `tests/orchestrator/core.test.ts` 等现有用例在 factory 重构后仍通过
- [x] 4.3 运行 `pnpm test` 与 `pnpm typecheck` 全绿（PMS 相关测试全绿；部分 Windows 环境既有用例失败与本次变更无关）

## 5. 文档与示例

- [x] 5.1 新建 `docs/pms-tracker.md`：凭据配置、env fallback、状态名注意事项、联调 checklist
- [x] 5.2 新增 `examples/workflow-pms/WORKFLOW.md`：PMS 只读 WORKFLOW 样例（平台中立 prompt）
- [x] 5.3 在 `docs/WORKFLOW.template.md` 增加 PMS tracker 配置注释段（不修改 Linear 默认行为说明）

## 6. 内网联调验收（人工，不阻塞 CI）

- [ ] 6.1 配置有效 OAuth 凭据与试点 projectKey / active_states
- [ ] 6.2 内网运行 Symphony，确认 poll 日志出现 PMS 候选工单
- [ ] 6.3 确认 running worker 状态 reconcile 与 terminal cleanup 行为正常
