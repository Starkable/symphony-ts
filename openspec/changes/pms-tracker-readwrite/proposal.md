## Why

`pms-bcs-integration-verify` 已在真实 BCS PMS 环境验证：assignee JQL、读/写备注（comment）、transition「暂停开发→开发暂停」与「提测→已提测」均可执行。Symphony 当前 PMS 集成仍为只读 poll，无法满足 BCS 场景「仅拉取指定经办人进行中工单、注入历史备注、澄清失败写回开发暂停+备注、归档成功写回已提测」的需求。现需将验证结论落地为 tracker 读扩展与 orchestrator 写回能力。

## What Changes

- WORKFLOW 新增可选 `tracker.assignee`（及 env 覆盖），JQL 追加 `assignee in (...)`；poll 排序改为 `ORDER BY updated ASC`
- Poll 时读取工单备注（Jira comment API），注入 Agent prompt（与 description 并列）
- 扩展 `PmsTrackerClient`：GET/POST comment、POST transition（复用 probe 已验证的 REST 契约）
- Orchestrator 在 agent turn 结束后读取 workspace workpad，解析信号并 **best-effort** 写回 PMS（不阻塞调度；失败入 pending 重试）
- 写回规则：
  - `Phase=failed` 且 Notes 含 `CLARIFY_BLOCKED:` → transition **暂停开发** → 开发暂停 + POST 备注（阻塞原因）
  - `Phase=done` → transition **提测** → 已提测（不写备注）
- 更新 BCS 示例 WORKFLOW：`terminal_states: [已提测]`、`assignee`、移除「一期只读」表述
- 文档：`docs/pms-tracker.md`、`docs/pms-field-mapping.md` 补充读写与写回契约

## Capabilities

### New Capabilities

- `pms-tracker-read`: WORKFLOW assignee 过滤、poll 时读取备注并注入 prompt、JQL 排序调整
- `pms-orchestrator-writeback`: turn 结束后解析 workpad 信号，orchestrator 执行 PMS transition 与备注写回及 pending 重试

### Modified Capabilities

（无。`openspec/specs/` 下尚无已归档 tracker spec；本 change 以 ADDED 为主。）

## Impact

- **代码**：`src/tracker/pms/`（client、jql、normalize）、`src/config/`（WORKFLOW 解析）、`src/orchestrator/`（写回钩子）、`src/agent/prompt-builder.ts`、`examples/workflow-pms/WORKFLOW.md`
- **依赖**：前置 change `pms-bcs-integration-verify` 报告 PASS（已满足）
- **系统**：Orchestrator 为 PMS 写回唯一权威；Agent 不直接调 PMS 写 API
- **运维**：提测 transition 可能依赖 PMS 侧字段/权限（如「测试分级」）；写回失败不阻塞其他工单调度
