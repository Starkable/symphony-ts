## Why

Symphony 当前仅支持 `tracker.kind: linear`，无法满足使用爱奇艺内部 PMS（Jira 企业实例）作为需求来源的场景。需要将需求平台抽象为可插拔 adapter（类似 agent harness 工厂模式），并在**一期只读**范围内支持从 PMS 拉取工单、驱动 orchestrator 的 poll / dispatch / reconcile 流程。实现须为纯 TypeScript，凭据通过 WORKFLOW 配置或环境变量注入，不依赖 Python、pms-opt-skill 或 FSB 运行时调用。

## What Changes

- 引入 `tracker-factory`：`tracker.kind` 决定实例化 Linear 或 PMS adapter，Linear 行为保持不变
- 新增 `tracker.kind: pms` 只读适配器，实现 `IssueTracker` 三方法（`fetchCandidateIssues`、`fetchIssuesByStates`、`fetchIssueStatesByIds`）
- 扩展 WORKFLOW 配置：PMS endpoint、projectKey（复用 `project_slug`）、`active_states` / `terminal_states`、OAuth 凭据（access token、secret、RSA 私钥路径）
- 凭据支持 WORKFLOW 明文、`$ENV_VAR` 引用、以及 canonical 环境变量 fallback（与 Linear `api_key` 模式一致）
- dispatch 前校验 PMS 凭据完整性；可选调用 `GET /rest/api/2/myself` 验证 OAuth 签名
- 新增 Vitest 单元测试（mock fetch）；新增 PMS WORKFLOW 配置示例与 docs 说明
- **一期不做**：评论写回、状态流转、建单、FSB/Skill 集成、Agent 写回工具（`pms_jira` 等）

## Capabilities

### New Capabilities

- `pms-tracker-readonly`：PMS（Jira REST + OAuth 1.0a RSA-SHA1）只读 issue tracker adapter，含配置解析、鉴权、JQL 查询、Issue 归一化与 factory 集成

### Modified Capabilities

（无。`openspec/specs/` 下尚无既有 capability spec；本 change 在 change 目录内新增 delta spec。）

## Impact

- **代码**：`src/tracker/`（factory、pms 子模块）、`src/config/`（types、resolver、defaults、校验）、`src/orchestrator/runtime-host.ts`（改用 factory）
- **错误码**：复用现有 `tracker_*` 通用码；必要时在 details 中标注 `kind: pms`
- **配置**：`WorkflowTrackerConfig` 扩展 PMS OAuth 字段；`validateDispatchConfig` 按 kind 分支校验
- **文档**：`docs/` 下 PMS tracker 配置说明；`examples/` 可选 WORKFLOW 样例（不写 README 功能细节）
- **依赖**：仅 Node ≥22 内置 `crypto` + `fetch`；不新增 Python 运行时依赖
- **非目标**：SPEC.upstream.md 全量修订留待后续；本 change 以 change spec 为验收依据
- **已知限制**：一期 `[CLARIFY]` 等写回仍仅在 Workpad，不同步至 PMS 评论
