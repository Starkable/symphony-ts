## Context

Symphony PMS tracker（`add-pms-tracker-readonly`）当前能力：

- JQL poll：`project` + `active_states` + `issue_types` + `exclude_draft_status`
- Search 字段：`summary, description, status, ...`（**不含** comment）
- Orchestrator dispatch 用 `issue.state`（`fields.status.name`）与 `active_states` 比对
- Agent prompt 仅含 description，WORKFLOW 声明「一期只读」

BCS 验证结论（`pms-bcs-integration-verify` evidence）：

| 项 | 结论 |
|----|------|
| Poll JQL | `status = "In Progress"` + `assignee in ("shenxianghong_wb")` → 200 |
| API `status.name` | 常为展示名 `进行中`（JQL 仍用 `In Progress`） |
| 读备注 | `GET /issue/{key}/comment` → 200，body 为 plain text |
| 写备注 | `POST /issue/{key}/comment` → 201 |
| 澄清失败 | transition `暂停开发` (281) → `开发暂停` |
| 归档成功 | transition `提测` (221) → `已提测`（需 PMS 侧字段/权限就绪） |
| 终态 | Symphony 负责到 **已提测**；之后人工处理 |

Policy（`docs/symphony-agent-workflow.md`）约定：高影响 unknown → `Phase=failed`，Notes：`CLARIFY_BLOCKED: <原因>`；全流程结束 → `Phase=done`。

## Goals / Non-Goals

**Goals:**

- BCS WORKFLOW 可配置 assignee，poll 仅拉取目标经办人「进行中」产品需求
- Poll 时读取备注并注入 prompt，Agent 可见 PMS 历史上下文
- Orchestrator 在 turn 结束后根据 workpad 信号写回 PMS（澄清失败 / 归档成功）
- 写回 best-effort + pending 重试，失败不阻塞 poll/dispatch
- 复用 probe 已验证的 transition 名匹配逻辑（`findTransitionMatch` 迁入 tracker 模块）

**Non-Goals:**

- Agent 直接调用 PMS 写 API
- 写回「已提测」之后的测试/上线状态
- 阻塞等待 PM 回复（V1 仍不 `blocked` 等人）
- 通用 PMS custom field 编辑器（除文档说明「测试分级」运维前置外）
- Linear tracker 写回

## Decisions

### 1. 读写边界：Orchestrator 写，Agent 只读

```
Agent turn ──► workpad 信号（Phase / Notes）
                    │
                    ▼
Orchestrator（turn_completed / worker 正常结束）
    ├── read workpad from workspace
    ├── parse CLARIFY_BLOCKED / done
    └── PmsTrackerClient.transition + addComment
```

**理由**：与 explore 共识一致；调度与外部系统一致性由 orchestrator 保证。

### 2. WORKFLOW `tracker.assignee`

- 类型：可选 `string` 或 `string[]`（YAML 单值或列表）
- 空/未配置：不追加 assignee JQL 子句（兼容现有行为）
- Env 覆盖：`PMS_TRACKER_ASSIGNEE`（逗号分隔多人）
- JQL：`assignee in ("user1", "user2")`

**理由**：验证已用 `shenxianghong_wb`；避免硬编码进仓库。

### 3. Poll 排序

当配置了 `assignee` 时，candidate JQL 使用 `ORDER BY updated ASC`；否则保持 `ORDER BY created ASC`。

**理由**：BCS 场景优先处理最久未更新的进行中工单。

### 4. 备注（comment）读取与注入

- Poll 后对每条 candidate issue 调用 `GET /issue/{key}/comment`（可并行，带上限）
- 存入 `Issue` 扩展字段 `comments: PmsComment[]`（或 tracker 侧 attach，prompt 前 merge）
- Prompt 追加一节「PMS 备注（最近 N 条）」；默认 N=10，可配置
- 与 description 分开展示

**理由**：用户明确「拉取时就需要读」；Jira search 不返回 comment 字段。

### 5. 写回触发矩阵

| Workpad 条件 | PMS 动作 | 备注 |
|--------------|----------|------|
| `Phase=failed` 且 Notes 任一行以 `CLARIFY_BLOCKED:` 开头或包含该前缀 | transition 名匹配 **暂停开发** → 开发暂停 | **是**：写入 Notes 中 CLARIFY_BLOCKED 行及后续阻塞说明 |
| `Phase=done` | transition 名匹配 **提测** → 已提测 | **否** |
| 其他 | 无写回 | — |

- 检测时机：worker 正常结束（`turn_completed` / outcome normal）后，读 `.symphony/workpad.md`
- 幂等：若 tracker 当前 state 已是目标态（开发暂停 / 已提测），skip transition，仅补写备注（CLARIFY 场景且备注未写过时可配置 skip）

**理由**：对齐 policy V1；成功路径不写备注为用户明确要求。

### 6. Transition 匹配

复用 verify 模块逻辑：按 transition `name` 或 `to.name` 子串匹配；目标关键字：

- 澄清失败：`开发暂停`（匹配 `暂停开发`）
- 归档成功：`已提测`（匹配 `提测`）

**理由**：BCS-496 probe 已验证。

### 7. 写回失败与 pending 重试

- 每次写回尝试记录 structured log（issue key、action、HTTP status）
- 失败写入本地 pending 队列（如 `.symphony/pms-writeback-pending.json` 或 orchestrator 内存 + 持久化）
- 每个 poll tick 或 turn 后 best-effort 重试 pending，成功则移除
- **不**因写回失败标记 worker 失败或阻止新 dispatch

**理由**： explore 共识；scheduler 正确性不依赖 PMS 写成功。

### 8. WORKFLOW 终态与 active 配置（BCS 示例）

```yaml
tracker:
  active_states: ["In Progress"]
  terminal_states: [已提测]
  issue_types: [产品需求]
  assignee: shenxianghong_wb
  exclude_draft_status: false  # 已精确 active_states 时可省略
```

- `开发暂停` **不**列入 terminal；靠不在 `In Progress` 自然退出 poll
- `terminal_states: [已提测]` 用于 reconcile 停止 worker

### 9. Status 展示名与 dispatch

验证报告 `returnedStatusName=进行中` 与 JQL `In Progress` 并存。实现时：

- **首选**：若 dispatch 实测无过滤问题，保持现有 `active_states` JQL 名配置
- **兜底**：在 PMS normalize 或 dispatch 比对层增加可选 alias map（`In Progress` ↔ `进行中`），由单测覆盖

**理由**：用户反馈不会被过滤；保留兜底避免回归。

### 10. 「测试分级」与提测权限

Probe 曾遇 transition 400（测试分级必填），运维侧已补权限/字段。自动化假设：

- 提测前工单在 PMS 侧已满足 workflow 必填项，或 service account 有权省略
- 若仍 400，写回失败进 pending 并打 log；不在本 change 实现通用 custom field 表单

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 每条 issue 额外 GET comment 增加 latency | 并行请求 + 仅 candidate 集合 + 可配置 disable |
| 重复写备注 | CLARIFY 写回前检查最近备注是否已含 `[Symphony]` 前缀 |
| transition 400（必填字段） | pending 重试 + 文档说明运维前置条件 |
| workpad 未更新即 turn 结束 | 仅 normal outcome 触发；parse 失败则 skip 写回 |
| 测试污染生产工单 | 文档强调 sandbox issue；写回仅对已 dispatch 工单 |

## Migration Plan

1. 实现读扩展 → `pnpm test` + `pnpm pms:smoke` 验证 assignee 过滤与 comment 注入
2. 实现写回 → 测试工单 manual e2e（workpad 信号 → PMS 状态）
3. 更新 `examples/workflow-pms/WORKFLOW.md` 与 docs
4. 归档 `pms-bcs-integration-verify`（可选，并行）

## Open Questions

- `assignee` 是否支持 JQL 函数（如 `currentUser()`）— 初版仅 literal 登录名
- pending 队列持久化路径是否进 `.symphony/` workspace 还是 orchestrator 全局目录
