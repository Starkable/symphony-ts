# PMS 字段对照说明

本文说明爱奇艺内部 PMS（Jira REST）与 Symphony `tracker.kind: pms` 之间的字段关系。

- **配置与联调**（OAuth、脚本、Checklist）：见 [pms-tracker.md](./pms-tracker.md)
- **WORKFLOW 全字段参考**：见 [WORKFLOW.template.md](./WORKFLOW.template.md)
- **可运行样例**：见 [examples/workflow-pms/WORKFLOW.md](../examples/workflow-pms/WORKFLOW.md)

---

## 1. 三层字段体系

理解 PMS 集成时，请区分三层，不要混用：

| 层次 | 位置 | 用途 |
|------|------|------|
| **配置层** | `WORKFLOW.md` → `tracker.*` | 决定 JQL 查哪些项目、状态、类型 |
| **协议层** | `/rest/api/2/search` 等 REST 响应 | Jira 原始 JSON |
| **领域层** | Symphony `Issue` | orchestrator poll、dispatch、prompt 模板 |

配置层字段**不会**原样出现在 `Issue` 里；`Issue` 由协议层经 `src/tracker/pms/pms-normalize.ts` 归一化得到。

```text
WORKFLOW (project_slug, active_states, …)
        ↓ 拼 JQL
POST /rest/api/2/search
        ↓ JSON (id, key, fields.summary, …)
normalizePmsIssue()
        ↓
Symphony Issue (identifier, title, state, …)
```

---

## 2. WORKFLOW 配置 ↔ Jira 概念

| WORKFLOW (`tracker.*`) | Jira 概念 | 生成的 JQL 片段 |
|------------------------|-----------|----------------|
| `project_slug` | **projectKey** | `project = "CS"` |
| `active_states` | **status**（JQL 可用名） | `status in ("Open", "In Progress")` |
| `terminal_states` | 终态 **status** | **启动时** `fetchIssuesByStates`（terminal workspace cleanup） |
| `issue_types` | **issuetype** 显示名 | `issuetype in ("产品需求")` |
| `exclude_draft_status: true` | 工作流过滤 | `status not in ("草稿", "审核中")` |
| `assignee` | **assignee** 登录名 | `assignee in ("user_wb")` |
| `endpoint` | Server 根 URL | `{endpoint}/rest/api/2/search` |

JQL 拼装实现：`src/tracker/pms/pms-jql.ts`。

### 可选字段行为摘要

| 字段 | 行为 |
|------|------|
| `issue_types` | 非空时追加 `issuetype in (...)` |
| `exclude_draft_status` | 为 `true` 时追加排除草稿/审核中；且当 `active_states` 为空时改用 `statusCategory != Done` |
| `assignee` | 非空时追加 `assignee in (...)`；启用时 candidate JQL 追加 `ORDER BY updated ASC` |
| `active_states` 为空 | 不生成 `status in (...)`，改由 `statusCategory != Done`（需配合 `exclude_draft_status` 等过滤） |

### OAuth 配置 ↔ 环境变量

| WORKFLOW | Canonical 环境变量 |
|----------|-------------------|
| `oauth.access_token` | `PMS_OAUTH_ACCESS_TOKEN` |
| `oauth.access_token_secret` | `PMS_OAUTH_ACCESS_TOKEN_SECRET` |
| `oauth.rsa_private_key_path` | `PMS_JIRA_KEY_PATH` |
| `endpoint` | `PMS_JIRA_SERVER` |
| `assignee` | `PMS_TRACKER_ASSIGNEE`（逗号分隔，覆盖 WORKFLOW） |

---

## 3. 状态名：JQL 名 vs UI 展示名

这是联调中最容易混淆的一点。

| 场景 | 写什么 | 示例 |
|------|--------|------|
| **WORKFLOW `active_states` / JQL** | Jira 接受的 **status JQL 名** | `Open`, `In Progress` |
| **PMS 页面 / `issue.state`** | 常为 **展示名** | `进行中` |
| **HTTP 400** | JQL 里写了 UI 中文但 workflow 不认 | `'status' 字段中没有 '进行中'` |
| **dispatch 不匹配** | poll 返回 `进行中` 但 `active_states` 为 `In Progress` | 内置 alias：`In Progress` ↔ `进行中`（`pms-status-alias.ts`） |

**规则**：以 `pnpm pms:verify-jql` 实测 JQL 是否返回 200 为准，不要仅凭 PMS 界面中文反推 JQL。

### 项目类型参考（需在本实例验证）

| 项目类型 | projectKey 示例 | `active_states` 示例 | `terminal_states` 示例 |
|----------|-----------------|----------------------|--------------------------|
| 通用 / CS 类 | `CS`, `BCS` | `Open`, `In Progress` | `Done`, `Closed` |
| 基线产品需求 | `BASELINEREQ` | `已计划`, `需求变更中` | `Done` 或项目实际终态名 |
| 开发任务 | `BASELINEBACKEND` 等 | `待开发`, `开发中` | 依项目 workflow |

同一 PMS 实例上，不同 projectKey 的 status 集合可能完全不同；换项目时必须重配 `active_states` / `terminal_states`。

---

## 4. Jira REST → Symphony `Issue`

Search 时请求的 Jira 字段列表（`src/tracker/pms/pms-client.ts`）：

```text
summary, description, status, labels, priority, created, updated
```

### 字段映射表

| Symphony `Issue` | Jira REST 来源 | 转换规则 |
|------------------|----------------|----------|
| `id` | `issue.id` | 数值 ID 转字符串 |
| `identifier` | `issue.key` | 如 `CS-7054` |
| `title` | `fields.summary` | 必填 |
| `description` | `fields.description` | 无则 `null` |
| `state` | `fields.status.name` | **展示名**（如 `进行中`） |
| `priority` | `fields.priority.name` | `P1` → `1`；无法解析则 `null` |
| `labels` | `fields.labels[].name` | 转小写数组 |
| `url` | 推导 | `{endpoint}/browse/{key}` |
| `branchName` | — | 一期固定 `null` |
| `blockedBy` | — | 一期固定 `[]` |
| `createdAt` | `fields.created` | 转 ISO8601 |
| `updatedAt` | `fields.updated` | 转 ISO8601 |
| `trackerComments` | `GET /issue/{key}/comment` | poll 后附加；prompt 注入「PMS 备注」节（默认最近 10 条） |

状态刷新（reconcile）另用 `id,key,status`，映射为 `IssueStateSnapshot`（`id`, `identifier`, `state`）。dispatch / reconcile 比对 `issue.state` 时会应用 **status alias**（例如 `进行中` 匹配 WORKFLOW 中的 `In Progress`）。

### WORKFLOW prompt 可用变量

与 Linear 一致，例如：

- `{{ issue.identifier }}` → `key`（`CS-7054`）
- `{{ issue.title }}` → `summary`
- `{{ issue.state }}` → `status.name`（展示名）
- `{{ issue.description }}`、`{{ issue.url }}`、`{{ issue.labels }}`

---

## 5. Orchestrator 写回矩阵（BCS 等 PMS 项目）

写回由 **orchestrator** 在 worker **正常结束**后触发，Agent **不**直接调用 PMS REST。信号来源：`.symphony/workpad.md`（V1.1 legacy）或 V1.2 产物扫描（`deriveEffectivePhase.allComplete`）。

| 信号来源 | 条件 | PMS 动作 | 备注 |
|----------|------|----------|------|
| workpad `clarify_blocked` | `Phase: failed` 且 Notes 含 `CLARIFY_BLOCKED:` | transition → **开发暂停** | POST 评论（前缀 `[Symphony]`）；已处于开发暂停则跳过 transition |
| workpad `done` | `Phase: done` | transition → **提测**（目标状态 **已提测**） | 不写评论；V1.1 legacy |
| V1.2 产物 `done` | `workflow.phases` 已配置且六阶段产物均完成（含 archived 目录） | transition → **提测**（目标状态 **已提测**） | 不写评论；无需 workpad |
| `none` | 其他 | 无 | — |

- 写失败进入内存 **pending 队列**，下次 poll tick 重试；不阻塞 dispatch。
- `terminal_states` 应包含 Symphony 负责到的终态（如 BCS：`已提测`）；`开发暂停` 非终态，靠移出 `In Progress` JQL 自然退出 poll。
- 部分项目 transition 可能要求必填自定义字段（如「测试分级」）；失败时查 HTTP 400 body 并在 PMS 侧补权限/默认值。

实现：`src/tracker/pms/pms-writeback.ts`、`src/workflow/writeback-signal.ts`、`src/workflow/workpad-writeback-signal.ts`。

---

## 6. 一期未映射的 PMS 字段

以下在外部 **pms-opt-skill** 等工具中常见，Symphony **一期不读入 `Issue`**：

| PMS / Jira 字段 | 说明 |
|-----------------|------|
| `issuetype` | 仅通过 WORKFLOW `issue_types` 参与 **JQL 过滤**，不进入 `Issue` |
| `assignee` / `reporter` | 经办人、报告人；`assignee` 可通过 WORKFLOW 参与 **JQL 过滤**，不进入 `Issue` 字段 |
| 自定义字段 | 如期望版本 `cf[10102]`、开发工程师 `customfield_*` |
| `issuelinks` | 阻塞 / 关联关系（`blockedBy` 未实现） |
| `fixVersions` / 组件 | 版本、模块等 |

扩展这些字段需要增加 Search `fields` 列表并扩展 `Issue` 模型。

---

## 7. 与 pms-opt-skill 的习惯对照

Symphony 不运行时依赖 pms-opt-skill，但 JQL 习惯可对齐：

| pms-opt-skill | Symphony WORKFLOW |
|---------------|-------------------|
| `projectKey` / `active_project` | `project_slug` |
| `PMS_OAUTH_*` | `oauth.*` 或同名环境变量 |
| JQL `issuetype in ("产品需求")` | `issue_types: [产品需求]` |
| 默认排除草稿/审核中 | `exclude_draft_status: true` |
| `statusCategory != Done` | `active_states: []` 且 `exclude_draft_status: true` |
| dev 任务 `status in ("待开发","开发中")` | `active_states` 按项目 workflow 配置 |

---

## 8. 如何自查字段是否配对

```bash
pnpm build

# 多种 JQL 矩阵（推荐第一步）
pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md

# 拉取候选工单预览（看 identifier / title / state）
pnpm pms:smoke examples/workflow-pms/WORKFLOW.md --limit 5
```

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| HTTP 400，`status' 字段中没有 'xxx'` | `active_states` / `terminal_states` JQL 名错误 | 改 WORKFLOW，用 verify-jql 试 |
| HTTP 400，`project' 字段中没有` | `project_slug` 错误或无权 | 核对 projectKey |
| 200 但 `total: 0` | 过滤过严 | 放宽 `issue_types` 或 `active_states` |
| smoke 成功但 `state` 是中文 | 正常：JQL 用英文名，展示用中文 | 无需改 WORKFLOW |

验证报告：`tmp/pms-jql-verify-report.json`。

---

## 9. 读 smoke 输出示例

```json
{
  "identifier": "CS-7054",
  "title": "人员预测算法侧调研分析",
  "state": "进行中",
  "url": "http://pms.qiyi.domain/browse/CS-7054"
}
```

对应关系：

- `identifier` ← Jira `key`
- `title` ← `fields.summary`
- `state` ← `fields.status.name`（**不是** WORKFLOW 里写的 `In Progress`）
- WORKFLOW 仍应配置 `active_states: [Open, "In Progress"]` 用于 JQL

---

## 相关文档

- [pms-tracker.md](./pms-tracker.md) — 配置、凭据、联调脚本
- [WORKFLOW.template.md](./WORKFLOW.template.md) — WORKFLOW 字段全集
- [DEV_GUIDE.md](./DEV_GUIDE.md) — 本地开发与排障
