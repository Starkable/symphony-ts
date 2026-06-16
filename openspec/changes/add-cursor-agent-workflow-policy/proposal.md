## Why

symphony-ts 在 Cursor CLI harness 跑通后，仍缺少一套可无人值守执行的 **Policy 层工作流**（澄清 → 计划 → 实现 → Subagent 验证 → 归档 → 提 PR）。若无统一约定，agent 容易跳过澄清、自报测试通过、或在验证失败时错误回退到需求层，导致编排流水线不可靠。

## What Changes

- 新增 Policy 层文档与模板：`docs/symphony-agent-workflow.md`、Workpad 约定（`.symphony/workpad.md`）、Cursor 向 WORKFLOW 模板片段
- 新增 `.agents/skills/` 最小集：`commit`、`push`、`proposal-review-subagent`、`qa-verify-subagent`（验证 **必须** 经 readonly Subagent，防主 Agent 包庇）
- 定义阶段状态机：`clarify → plan → proposal_review → execute → verify → archive → submit → handoff`，以及 `blocked` 暂挂
- **硬门禁 C0**：未完成澄清禁止写产品代码；验证失败默认回到 `execute`（不回澄清）
- **1 需求 : 1 ChangeRef/Plan**，避免 scope 膨胀；OpenSpec 变更流程为**可选增强**，不进入默认关键路径
- README 增加 Roadmap 短链；完整暂缓项写入 docs TODO
- 本阶段 **不做**：需求平台对接、orchestrator 评论监听、`[MISSING_INFO]` 解析、clarification sweeper

## Capabilities

### New Capabilities

- `cursor-agent-workflow-policy`：基于 Workpad + WORKFLOW.md 的 Cursor CLI 无人值守 Policy 工作流，含阶段门禁、Subagent 验证、skills 与文档模板

### Modified Capabilities

（无。`openspec/specs/` 下尚无既有 capability spec。）

## Impact

- **文档**：`docs/symphony-agent-workflow.md`（新建）、`docs/WORKFLOW.template.md`（扩展 Cursor Policy 段）、`README.md`（Roadmap 短节）
- **Skills**：`.agents/skills/*`（新建，供目标仓库复制或本仓库示例）
- **示例**：可选 `examples/workflow-cursor-policy/` 下的 WORKFLOW.md 样例
- **非目标**：不改 orchestrator/core、不新增 tracker adapter、不强制绑定 OpenSpec propose/apply/archive 流程
- **依赖**：建议 `fix-cursor-cli-harness` 合并或收尾后再试跑完整 Policy 流程
