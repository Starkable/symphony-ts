## Context

Symphony 已有 PMS 只读 tracker（`add-pms-tracker-readonly`）及联调 CLI：

- `pnpm pms:verify-jql` — JQL 矩阵 + `tmp/pms-jql-verify-report.json`
- `pnpm pms:smoke` — 拉候选工单 preview（含 `state` 展示名）

BCS 集成目标 JQL 样例：

```text
project = "BCS" AND status = "In Progress" AND assignee in ("shenxianghong_wb") ORDER BY updated ASC
```

待验证项来自 explore 结论（V1–V5）：状态 JQL 名、assignee 过滤、JQL 名 vs `status.name`、transition 可达性、comment 读写权限。

## Goals / Non-Goals

**Goals:**

- 提供一键命令，在真实 PMS 上验证上述不确定项并输出机器可读报告
- 扩展 verify-jql，覆盖 BCS + assignee + 目标状态 JQL 合法性（200 即合法，不要求 `total > 0`）
- 新增 probe：列出 BCS 项目 status 全集；对指定 issue 列出 transitions 与 comments；可选 dry-run 写 comment/transition（需显式 flag）
- 报告字段足够支撑后续 `pms-tracker-readwrite` proposal 定稿 WORKFLOW 配置

**Non-Goals:**

- 不修改 orchestrator、不扩展 `IssueTracker` 接口
- 不默认执行破坏性写操作（transition/comment 写需 `--allow-write` + 指定测试工单）
- 不替代 Vitest mock 单测

## Decisions

### 1. 两个 CLI 分工

| CLI | 职责 |
|-----|------|
| `pms:verify-jql` | 批量 JQL search，验证语法与权限；无 issue key 依赖 |
| `pms:probe` | 需 `PMS_PROBE_ISSUE_KEY` 或 CLI 参数；调 statuses/transitions/comments |

**理由**：verify-jql 已存在且 CI 友好；probe 依赖具体工单，分开更清晰。

### 2. BCS verify case 配置来源

优先级：

1. WORKFLOW `tracker.project_slug` / 未来 `assignee` 字段（若已配置）
2. 环境变量 `PMS_VERIFY_PROJECT`（默认 `BCS`）、`PMS_VERIFY_ASSIGNEE`（默认 `shenxianghong_wb`）
3. 硬编码 fallback 仅作文档示例，运行时以 env 为准

**理由**：避免把个人 assignee 写死进仓库默认值；本地 `.env` 或 shell export 注入。

### 3. JQL 名 vs 展示名对照

verify case `bcs-in-progress-status-name-mapping` 在 `total > 0` 时记录首条 issue 的 `fields.status.name`，与 JQL 中使用的 `"In Progress"` 并列写入报告 `jqlStatusName` / `returnedStatusName`。

**理由**：直接闭合 dispatch 二次过滤风险，无需人工对比 smoke 输出。

### 4. Transition / Comment 写探测

默认 **只读**。`pms:probe --allow-write` 时：

- comment：POST 固定前缀 `[Symphony Probe]` 的测试评论
- transition：**不默认执行**；仅 `--allow-write --transition-to "开发暂停"` 时在指定测试工单执行

**理由**：防止误改生产工单；写探测必须显式 opt-in。

### 5. 报告格式

合并写入 `tmp/pms-bcs-verify-report.json`：

```json
{
  "generatedAt": "ISO8601",
  "project": "BCS",
  "assignee": "shenxianghong_wb",
  "probeIssueKey": "BCS-1234",
  "jqlCases": [ { "name", "jql", "ok", "status", "total", "returnedStatusName", "errorBody" } ],
  "projectStatuses": [ { "issueType", "statuses": ["..."] } ],
  "transitions": [ { "id", "name", "toStatus" } ],
  "comments": { "ok", "count", "sample" },
  "writeProbe": { "commentOk", "transitionOk", "skipped" }
}
```

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 测试工单不存在或无权限 | probe 报告 `skipped: true` + 文档说明需自备 sandbox issue |
| assignee case `total: 0` 但 JQL 200 | 报告区分 `jqlValid: true` 与 `hasMatchingIssues: false` |
| 写探测误操作 | 双重 flag + 工单 key 必须显式传入 |
| OAuth 用户无 comment/transition 权限 | 报告记录 HTTP 403，后续 change 调整 service account |

## Migration Plan

1. 实现 CLI → 本地 `pnpm build && pnpm pms:verify-jql && pnpm pms:probe`
2. 将 PASS 报告归档到 change 目录 `evidence/`（可选，人工提交）或团队 wiki
3. 后续 read/write change 引用报告中的确切 status/assignee 字符串

## Open Questions

- BCS 产品需求 workflow 是否包含「Resolved」（已知非目标终态，probe 可记录是否存在）
- 澄清失败/归档成功的 orchestrator 信号契约（P1/P2）留待 read/write change，不在本 spike 范围
