## Context

- 已有 `add-cursor-agent-workflow-policy`：Workpad + Phase 状态机 + Subagent 验证 + `.agents/skills`
- 已有 OpenSpec skills（`.cursor/skills/openspec-*`）与 spec-driven schema
- 编排器只 dispatch；Phase 推进靠 WORKFLOW prompt + workpad + agent 自觉
- 团队结论：Policy 管 Gate；OpenSpec 默认实现 plan/execute/archive；V1 无人工、无 Subagent、无 Git

## Goals / Non-Goals

**Goals:**

- 定义 V1 默认 Phase → OpenSpec skill 映射与 Workpad 瘦身模板
- `ChangeRef = kebab-case(issue.identifier)` 绑定唯一 `openspec/changes/<ChangeRef>/`
- 全流程不跳步（仅 Gate 表合法回退）；终点 `archive` → `done`
- 澄清失败用 `Phase=failed` + `CLARIFY_BLOCKED`，不用 `blocked` 等人
- `proposal_review` 保留：主 agent 自审 openspec 制品，输出 `REVIEW_REPORT`
- `verify`：主 agent 执行 `tasks.md` 末尾 `## Validation` 命令，输出 `VERIFICATION_REPORT`
- 文档与可运行 WORKFLOW 示例可供 PMS / Linear 复用

**Non-Goals:**

- orchestrator 解析 workpad / 拦截非法 Phase
- Subagent、commit、push、PR、handoff（V2）
- `openspec sync-specs` 默认开启
- PMS 写回、execution-state.json、clarification sweeper

## Decisions

### D1：Policy 抽象层 + OpenSpec 默认后端

- **选择**：Workpad 仅存 Phase、ChangeRef、C0 checklist、Gate Log、Notes；Plan/AC/Tasks/Validation 以 openspec 制品为准
- **理由**：避免双真相源；与 OpenSpec 生命周期对齐
- **备选**：继续 Workpad 手写 Plan — 已弃用为 V1 默认

### D2：V1 状态机终点

```
clarify → plan → proposal_review → execute → verify → archive → done
```

- 移除 V1 路径上的 `submit`、`handoff`、`blocked`（等人）
- **失败**：clarify 高影响 unknown 无法推断 → `failed`（非 blocked）

### D3：plan 默认 `openspec-ff-change`

- **理由**：全自动少轮次，一次生成 apply-ready 制品
- **备选**：`openspec-propose` — 大改可在 WORKFLOW 注释中改用 ff vs propose

### D4：proposal_review 保留，主 agent 自审

- **输入**：`openspec/changes/<ChangeRef>/` 下 proposal、specs、design、tasks
- **输出**：Notes 中 `REVIEW_REPORT: PASS|FAIL`；FAIL 仅改 openspec 制品，Phase 保持 `proposal_review` 或回 `plan`

### D5：verify 单路径（主 agent）

- 执行 `tasks.md` 的 `## Validation` 命令（如 `pnpm test`、`pnpm lint`）
- 检查 tasks 勾选与实现一致
- 输出 `VERIFICATION_REPORT: PASS|FAIL`；FAIL → `execute`
- V2 再引入 readonly Subagent

### D6：ChangeRef 与无人值守 WORKFLOW 覆盖

- WORKFLOW prompt **MUST** 声明：禁止 AskUserQuestion 选 change；仅操作 `ChangeRef` 对应目录
- 不修改上游 OpenSpec skill 源码；用 WORKFLOW + 可选 wrapper skill 覆盖

### D7：环境与部署

- `hooks.after_create`：安装 openspec CLI、复制 `.cursor/skills`；目标仓无 `openspec/` 时模板带入或 init（实施 tasks 二选一）
- V1 不复制 commit/push skills

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 主 agent 自证 verify 不可靠 | V1 接受；Gate Log + 命令 exit 记入 Notes；V2 Subagent |
| continuation prompt 不重复 Policy | WORKFLOW 要求每 turn 先读 workpad Phase |
| openspec CLI 未安装 | plan 前检测；失败 → `failed` + Notes |
| 与旧文档 Subagent 硬门禁矛盾 | 文档分 V1/V2 节；旧条款标 V2 |
| ff-change 制品质量不稳定 | proposal_review 自审 + P2 Gate |

## Migration Plan

1. 合并本 change 文档与示例
2. 团队将 WORKFLOW 从旧 Policy 样例切到 V1 OpenSpec 样例
3. `after_create` 增加 openspec CLI（与试跑 checklist 一并验证）
4. V2 迭代：Subagent、Git、sync-specs、blocked 可选恢复

## Open Questions

- `ChangeRef` 命名：仅 `bcs-1234` 是否在多标题冲突时需加 slug（实施时默认仅 identifier）
- 目标仓 `openspec init` vs 模板复制 `openspec/` — 在 tasks 选定一种
