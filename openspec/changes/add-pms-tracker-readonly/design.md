## Context

Symphony 当前 issue tracker 实现为硬编码 `LinearTrackerClient`：`IssueTracker` 接口已定义三方法读操作，但 `config-resolver` 的 `validateDispatchConfig` 仅接受 `tracker.kind: linear`，`runtime-host.ts` 直接 `new LinearTrackerClient`。

爱奇艺内部 PMS 是基于 Jira 的企业实例（默认 `http://pms.qiyi.domain`），使用 **OAuth 1.0a + RSA-SHA1** 鉴权（`consumer_key: qa-monitor`），REST 路径为 `/rest/api/2/*`。外部 pms-opt-skill 项目提供了 JQL、字段、OAuth 参数的参考实现，但 **Symphony 不得运行时依赖 Python、Skill 或 FSB API**。

讨论已锁定：

- **一期只读**：仅实现 `IssueTracker` 三方法
- **纯 TypeScript**：Node `crypto` + `fetch`
- **凭据**：WORKFLOW 配置 + `$ENV_VAR` + canonical 环境变量 fallback
- **配置**：`project_slug` 语义为 Jira `projectKey`；`active_states` / `terminal_states` 由 WORKFLOW 自行维护中文状态名

## Goals / Non-Goals

**Goals:**

- 引入 `createIssueTracker()` 工厂，模式对齐 `createAgentHarness()`
- 新增 `PmsTrackerClient` 实现 `IssueTracker`，通过 Jira REST 只读 API 完成 poll / reconcile
- 扩展 WORKFLOW 配置与 dispatch 校验，支持 `tracker.kind: pms`
- 单元测试覆盖 OAuth 签名、JQL 构建、响应归一化（mock fetch）
- 在 `docs/` 提供 PMS tracker 配置说明与 WORKFLOW 示例片段

**Non-Goals:**

- 评论写回、状态流转、建单、Agent 工具（`pms_jira` 等）
- Python / pms-opt-skill / FSB 运行时集成
- `blockedBy` 从 `issuelinks` 完整解析（一期返回空数组）
- SPEC.upstream.md 全量修订（本 change 以 change spec 验收）
- RSA 私钥 PEM 内联配置（一期仅文件路径）

## Decisions

### D1：Tracker 工厂模式

- **选择**：新增 `src/tracker/tracker-factory.ts`，`createIssueTracker(config): IssueTracker` 按 `kind` switch
- **理由**：与 `harness-factory.ts` 一致，消除 `runtime-host.ts` 硬编码
- **备选**：在 resolver 内联实例化 — 拒绝，职责不清

### D2：PMS 鉴权（纯 TS）

- **选择**：`src/tracker/pms/pms-oauth.ts` 使用 Node `crypto.createSign('RSA-SHA1')` 构建 OAuth 1.0a Authorization 头；不引入 Python
- **参数**（借鉴 pms-opt-skill，代码独立实现）：
  - `consumer_key`：默认 `qa-monitor`，可配置覆盖
  - `access_token` / `access_token_secret`
  - RSA 私钥 PEM（从 `rsa_private_key_path` 读取，支持 `~` 展开）
- **理由**：符合架构规范；凭据由运维/用户预注入 env，Symphony 不做 FSB 拉取
- **备选**：npm `oauth-1.0a` 库 — 若手写签名测试困难可选用，仍为库依赖非平台依赖

### D3：凭据配置与解析优先级

WORKFLOW 示例：

```yaml
tracker:
  kind: pms
  endpoint: http://pms.qiyi.domain
  project_slug: BASELINEREQ
  active_states: [待开发]
  terminal_states: [已关闭, 已取消]
  oauth:
    access_token: $PMS_OAUTH_ACCESS_TOKEN
    access_token_secret: $PMS_OAUTH_ACCESS_TOKEN_SECRET
    rsa_private_key_path: $PMS_JIRA_KEY_PATH
    consumer_key: qa-monitor          # 可选
    validate_on_dispatch: true        # 可选，默认 true
```

解析优先级（每个字段）：WORKFLOW 明文 → `$ENV` 引用 → canonical 环境变量 fallback：

| 字段 | Canonical env |
|------|---------------|
| access_token | `PMS_OAUTH_ACCESS_TOKEN` |
| access_token_secret | `PMS_OAUTH_ACCESS_TOKEN_SECRET` |
| rsa_private_key_path | `PMS_JIRA_KEY_PATH` |
| endpoint | `PMS_JIRA_SERVER` |

### D4：REST API 与 JQL 映射

| IssueTracker 方法 | Jira REST | JQL |
|-------------------|-----------|-----|
| `fetchCandidateIssues` | `POST /rest/api/2/search` | `project = "{projectKey}" AND status in (...)` |
| `fetchIssuesByStates` | 同上 | `project = "{projectKey}" AND status in ({states})` |
| `fetchIssueStatesByIds` | 同上 | `id in ({ids})` |

- 分页：`startAt` + `maxResults`（默认 50，对齐 Linear page size）
- 网络超时：30000ms（复用 `DEFAULT_LINEAR_NETWORK_TIMEOUT_MS` 或新增 PMS 常量）
- `fetchIssueStatesByIds` 的 `fields` 参数最小化：`id,key,status,summary`

### D5：Issue 归一化

| `Issue` 字段 | Jira 来源 |
|-------------|-----------|
| `id` | numeric `id` 字符串化 |
| `identifier` | `key`（如 `BASELINEREQ-34606`） |
| `title` | `fields.summary` |
| `description` | `fields.description`（null 若缺失） |
| `state` | `fields.status.name` |
| `labels` | `fields.labels[].name` 小写 |
| `blockedBy` | 一期固定 `[]` |
| `branchName` | `null`（PMS 无对应字段） |
| `url` | `{endpoint}/browse/{key}` |
| `priority` | 数值化或 null |
| `createdAt` / `updatedAt` | ISO-8601 解析 |

### D6：Dispatch 校验

- `kind: pms` 时：
  - 不要求 `tracker.api_key`（Linear 专用）
  - 要求 `project_slug`、`endpoint`、oauth 三件套非空
  - `validate_on_dispatch !== false` 时调用 `GET /rest/api/2/myself` 验证签名
- 错误码复用现有 `tracker_credentials_missing`、`tracker_http_error`、`unsupported_tracker_kind` 等

### D7：Codex / Agent 工具边界

- 现有 `runner.ts` 已对非 linear kind 跳过 `linear_graphql` 注入 — **无需改动**
- 一期不新增 PMS 写回工具；WORKFLOW prompt 由用户在试点仓库自行调整为平台中立文案

### D8：测试策略

- Vitest + mock `fetch`：覆盖签名头格式、JQL 构建、分页、归一化、错误路径
- 不依赖真实 PMS 网络的内网 CI 可运行
- 真实 PMS 联调作为人工验收 checklist（需有效凭据 + projectKey + 状态名）

### D9：文档落点

- PMS 配置细节：`docs/pms-tracker.md`（新建）
- 可选示例：`examples/workflow-pms/WORKFLOW.md`
- **不**在 README.md 展开实现细节（符合仓库文档规范）

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| OAuth RSA-SHA1 签名与 Jira 实例不兼容 | 联调 checklist 调 `/myself`；单元测试锁定签名串格式 |
| 中文状态名配置错误导致空 poll | 文档强调与 PMS 完全一致；日志输出实际 JQL |
| PMS 内网 endpoint 不可从公网 CI 访问 | 单元测试 mock fetch；联调在内网环境进行 |
| 一期无写回，`[CLARIFY]` 只在 Workpad | proposal 已声明；二期 change 补 Layer 2 |
| `blockedBy` 为空可能影响未来阻塞检测 | 一期 orchestrator 不依赖；二期补 issuelinks 解析 |

## Migration Plan

1. **PR-1**：`tracker-factory` + config 扩展 + linear 走 factory（零行为变化）
2. **PR-2**：`PmsTrackerClient` + 测试 + docs
3. **回滚**：WORKFLOW 改回 `kind: linear` 即可，无数据迁移
4. **联调**：配置凭据 → `pnpm test` → 内网 `symphony` 指向 PMS WORKFLOW → 确认 poll 日志出现候选工单

## Open Questions

- 试点 `projectKey` 与 `active_states` / `terminal_states` 具体值（联调前由业务方提供，不阻塞开发）
- 是否在后续 change 中将 `tracker.kind: pms` 写入 SPEC.upstream.md §11
- 二期写回是否扩展 `IssueTracker` 接口或引入独立的 `IssueTrackerWriter`
