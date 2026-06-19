## Why

Workflow Dashboard MVP 已具备 Artifact Store 与三页 UI，但验收暴露三类问题：（1）阶段产物展示与业务语义错位（澄清无提案、规划混 proposal+tasks、执行堆 log、评审/验证/归档报告缺失）；（2）Dashboard UX 问题（整页 SSE 刷新、Updated 时间、Preview 不渲染 MD、英文文案）；（3）V1 Policy 阶段顺序（plan → proposal_review）与团队流程不符——**应先评审需求提案，再通过后再规划 tasks**。

团队已选定 **方案 B（V1.1）**：`clarify → proposal_review → plan → execute → verify → archive`；OpenSpec 流程定制放在 **独立策略包**（`SYMPHONY_POLICY_ROOT`），不修改 `symphony-ts/openspec/` 元开发目录；叙述与 UI 以中文为主。

## What Changes

- **BREAKING（Policy）**：V1.1 阶段顺序与 Gate 语义调整（P2：评审→规划；P1：规划→执行；C0：澄清→评审）
- 新增 **外部策略包**约定与 bootstrap 文档：`symphony-policy-bundle` 目录结构、中文 skills、报告模板、`openspec/config.yaml` 中文 rules
- 更新 `docs/symphony-agent-workflow.md` 与 WORKFLOW 示例：V1.1 Phase 路由、Skill 映射（弃 plan 阶段默认 `openspec-ff-change` 一次全出）
- **阶段产物契约（Phase Artifact Contract）**：manifest-builder / exporter 按契约映射各阶段主产物；从 workpad Notes 合成或读取 `.symphony/workflow/phases/` 下中文报告
- **Dashboard V1.1 对齐**：时间线顺序与 V1.1 一致；execute 不展示文档列表；列表显示开始时间；UI 中文化；MD Preview 渲染；SSE 改为局部更新（非整页 reload）
- 策略包内 OpenSpec skills 中文化（步骤说明、制品正文中文）；Phase id / 文件名保留英文
- **不在本 change**：hydrate、live SSE tail（仍可选后续）；fork OpenSpec CLI

## Capabilities

### New Capabilities

- `symphony-v1-1-policy`：V1.1 状态机、Gate 表、WORKFLOW/workpad 约定、与 V1 差异说明
- `policy-bundle-integration`：`SYMPHONY_POLICY_ROOT`、bootstrap、策略包目录契约、与 workspace `after_create` 集成
- `workflow-phase-contract`：各 Phase 主/次产物路径、manifest 生成规则、Notes 合成报告、Dashboard 展示白名单
- `workflow-dashboard-v1-1`：Dashboard UX（刷新、i18n、MD Preview、开始时间、V1.1 时间线顺序）

### Modified Capabilities

（无：`openspec/specs/` 尚无已归档主 spec；`symphony-workflow-dashboard` change 内 spec 未归档，本 change 以新增 delta spec 为主。）

## Impact

- **symphony-ts 代码**：`src/artifact-store/types.ts`（`V1_BUSINESS_PHASES` 顺序）、`manifest-builder.ts`、`workflow-render.ts`、`workflow-service.ts`、`dashboard-live-updates` 消费方式
- **symphony-ts 文档**：`docs/symphony-agent-workflow.md`、`docs/workflow-dashboard.md`、`docs/WORKFLOW.template.md`、`docs/symphony-workflow-evolution-plan.md`
- **外部仓库/目录**：`symphony-policy-bundle`（建议独立 git 仓或团队共享路径；本 change 在 symphony-ts 提供示例路径与 bootstrap 引用）
- **示例**：`examples/workflow-cursor-policy/WORKFLOW.md` 等更新为 V1.1 路由
- **关系**：建立在 `symphony-workflow-dashboard` MVP 之上；MVP 可归档后实施本 change
