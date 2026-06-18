## Why

symphony-ts 已有 Policy 层文档（`docs/symphony-agent-workflow.md`）与 Workpad 约定，但默认仍以 Workpad 手写 Plan/AC 为主，OpenSpec 仅为「可选增强」。团队在 explore 中确认：**Policy 作为抽象编排层，OpenSpec 作为各 Phase 的默认实现后端**；V1 需全自动、不跳步、无 Subagent、暂不做 Git/PR，且 `ChangeRef` 与工单绑定。

若无统一 V1 规格，agent 易跳过 `proposal_review`、双写 Workpad 与 openspec 制品，或与旧版 Subagent 硬门禁文档冲突。

## What Changes

- 在 `docs/symphony-agent-workflow.md` 新增 **「V1 OpenSpec 默认模式」** 章节：Phase 状态机、Gate、ChangeRef 绑定、全自动失败策略
- 将原 Subagent 硬门禁、`blocked` 等人、`submit`/`handoff` 标为 **V2**；V1 改为主 agent 自审（`proposal_review`）与自验证（`verify`）
- 更新 `examples/workflow-cursor-policy/WORKFLOW.md` prompt：按 Phase 引用 OpenSpec skills + WORKFLOW 无人值守约束
- 新增 `examples/workflow-pms-openspec/WORKFLOW.md`（PMS 只读 tracker + V1 Policy prompt）
- 扩展 `docs/WORKFLOW.template.md`：OpenSpec V1 段、`tasks.md` 末尾 `## Validation` 约定
- 可选：新增 `.agents/skills/symphony-v1-policy/SKILL.md`（ChangeRef 绑定、禁止 AskUserQuestion）
- 文档说明 `hooks.after_create` 默认安装 openspec CLI 并复制 `.cursor/skills`
- **不修改** orchestrator/core；不实现 execution 层门控；V1 不做 commit/push/archive sync-specs

## Capabilities

### New Capabilities

- `symphony-policy-v1-openspec`：V1 Policy 与 OpenSpec 默认绑定的需求规格（Phase、Gate、Workpad 瘦身、ChangeRef、验证与失败策略）

### Modified Capabilities

- `cursor-agent-workflow-policy`：将 OpenSpec 从可选改为 V1 默认实现路径；调整 blocked/Subagent/submit 等与 V1 简化模式冲突的条款

## Impact

- **文档**：`docs/symphony-agent-workflow.md`、`docs/WORKFLOW.template.md`、README Roadmap 一句更新
- **示例**：`examples/workflow-cursor-policy/`、`examples/workflow-pms-openspec/`（新建）
- **Skills**：可选 `symphony-v1-policy`；V1 WORKFLOW 不引用 commit/push
- **依赖**：建议 `fix-cursor-cli-harness` 可用；目标 workspace 需 openspec CLI
- **关系**：在 `add-cursor-agent-workflow-policy` 之上演进，不重复实现 orchestrator 能力
