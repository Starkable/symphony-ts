## Context

- symphony-ts 已有 `src/observability/` Dashboard：单页 HTML、`RuntimeSnapshot`、`GET /api/v1/<issue>`（仅 running/retry，无 Phase/产物）
- V1 Policy（`docs/symphony-agent-workflow.md`）定义完整 Phase：`clarify → plan → proposal_review → execute → verify → archive → done/failed`，Gate C0/P1/P2/V1；产物分散在 `.symphony/workpad.md`、`openspec/changes/<ChangeRef>/`、`.symphony/cursor-turn-*.log`
- 工单 workspace 在 terminal reconcile 与启动 cleanup 时会被 `removeForIssue` 删除（`SPEC.upstream.md` §8.6、§9.1）
- UI 原型 `symphony-obs` 提供三页布局与蓝色主色时间线；**原型仅 5 阶段且为 mock 数据**，实现须以 V1 完整 Phase + Artifact Store 为准

## Goals / Non-Goals

**Goals:**

- 可配置 **Artifact Store**，按 `issue_identifier` 目录（如 `BCS-423/`）持久化 workflow 档案
- **manifest.json** 作为 Dashboard 主索引（Phase 状态、Gate、artifacts 列表、runtime 摘要）
- **Exporter** 在 turn 结束、Phase/Gate 变更检测、`before_remove` 时同步 workspace → store
- **Workflow API** + **三页 UI**（样式参考 symphony-obs，主色 blue-600）：总览、详情、历史
- 列表/详情时间线展示 **7 个业务 Phase**（不含 `done`/`failed` 作进行中圆点；终态用 badge/进度条表达）
- 产物 Preview：MD/LOG/纯文本优先；路径读取须 workspace/store path containment
- running 工单实时 mirror；terminal 后 History 仍可访问

**Non-Goals:**

- orchestrator 解析 workpad 并拦截非法 Phase（仍属 Policy TODO）
- V1 人机按钮（Action Required、Take Task、`blocked` 等人）
- PDF/DOCX 渲染引擎（可后续扩展）
- 修改 V1 Policy Phase 定义或 OpenSpec skill 行为
- Git push / tracker 写回评论

## Decisions

### D1：执行面 vs 档案面分离

- **选择**：Workspace 仅执行；Artifact Store 持久化 + Dashboard 只读
- **理由**：workspace 可销毁；统一目录便于运维浏览与 History
- **备选**：仅 workspace 内 `.symphony/workflow/` — 无法 survive cleanup

### D2：Store 目录布局

```
<artifact_store.root>/
└── <issue_identifier>/          # 如 BCS-423
    ├── meta.json                # issue_id, change_ref, mode, title, priority, 时间
    ├── manifest.json            # phases, gates, artifacts, runtime 摘要
    ├── workflow/phases/         # 阶段证明 md（clarify/review/verify 等）
    ├── openspec/changes/<change_ref>/   # 从 workspace 同步的副本
    └── logs/                    # cursor-turn-*.log, validation/*.log
```

- `change_ref` = `kebab-case(issue.identifier)`，与 Policy 一致
- **备选**：顶层再用 `by-id/<issue_id>/` — 首期用 identifier 目录 + `meta.json` 记录 issue_id；rename 时后续迭代

### D3：manifest 生成

- **选择**：Orchestrator **Exporter** 为主（扫描 workpad Phase/Gate Log、openspec 目录、turn logs，写入 manifest）；agent 仍按 Policy 写 workpad/openspec，不强制 agent 手写 manifest
- **理由**：减少 agent 双写；Dashboard 数据一致
- **备选**：agent 每 Phase 切换写 manifest — 易漏、难测

### D4：Export 时机

| 时机 | 动作 |
|------|------|
| Worker turn 正常/异常结束 | 增量 sync workpad、最新 turn log、更新 manifest.runtime |
| 检测到 workpad Phase/Gate 变化 | 全量 sync 当前 Phase 相关 openspec + 证明 md |
| `before_remove` / terminal cleanup 前 | 全量 export 兜底 |
| 可选 Phase 3 | `after_create` hydrate store → workspace |

### D5：Workflow API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/workflows?status=active\|archived\|all` | 列表（读 store 索引 + 合并 running 内存态） |
| GET | `/api/v1/workflows/:issue_identifier` | 详情 manifest + meta |
| GET | `/api/v1/workflows/:issue_identifier/artifacts/*` | 安全读 store 内文件（Content-Type 按扩展名） |
| GET | `/api/v1/workflows/:issue_identifier/live` | SSE tail 最新 turn log（Phase 3，可选） |

保留：`/`（总览）、`/api/v1/state`、`/api/v1/events`、`/api/v1/refresh`

### D6：UI 实现

- **选择**：独立三页 HTML 模板（或静态资源目录）+ 服务端渲染/注入初始 JSON；样式 Tailwind 类名与 symphony-obs 对齐（Inter、blue-600、卡片、时间线、Modal）
- **理由**：与原型结构一致；可与现有 `dashboard-render.ts` 共存后逐步替换首页
- **主色**：blue-600（非现有 Symphony 绿 accent）

### D7：Phase UI 映射

| phase id | 中文标签 |
|----------|----------|
| clarify | 需求澄清 |
| plan | 方案规划 |
| proposal_review | 提案评审 |
| execute | 执行实现 |
| verify | 验证 |
| archive | 归档 |
| done | 已完成（终态 badge） |
| failed | 已失败（终态 badge） |

横向时间线渲染 **7 个业务 Phase** 节点；`done`/`failed` 在卡片标题或进度区展示，不压缩为原型 5 步。

### D8：配置

```yaml
artifact_store:
  root: $SYMPHONY_ARTIFACT_STORE   # 必填方可启用 workflow UI；未配置则仅保留现有 Dashboard
  enabled: true
```

与 `workspace.root` 独立；文档说明 deploy 路径示例。

### D9：Retention

- **首期**：永久保留 store 内容；design 预留 `retention_days` 配置位，默认 null（不删）

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Exporter 解析 workpad markdown 脆弱 | 结构化读取 Phase/Gate 行；长期可增 `.symphony/execution-state.json` |
| Store 与 workspace 不一致 | manifest 含 `synced_at`；before_remove 全量兜底 |
| 8 节点横向时间线拥挤 | 小屏横向滚动；详情页纵向为主 |
| 路径遍历攻击 | 复用 `path-safety`  containment，禁止 `..` 与 store 外读 |
| 磁盘增长 | 后续 retention；logs 可截断策略 |
| issue identifier 变更 | meta.json 存 issue_id；History 搜索同时支持 id |

## Migration Plan

1. 部署时配置 `artifact_store.root` 空目录
2. 升级 symphony-ts；新 Worker turn 开始写入 store
3. 已有 workspace 在下次 turn 或 cleanup 前 export；无历史则 History 为空属预期
4. 回滚：关闭 `artifact_store.enabled`，Dashboard 回退现有单页表格；store 目录保留不删

## Open Questions

- （已关闭）主色：blue-600，跟 symphony-obs
- （已关闭）Phase 数：7 节点 + 终态 badge，不合并 proposal_review
- 多机部署 store 是否需 NFS/对象存储 — 首期单机目录，文档注明
