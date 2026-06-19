## Why

V1.1 将 Phase 路由、Gate 与 skill 步骤分散在 WORKFLOW Prompt、workpad 与多套 skill 中，产物路径分裂在 `openspec/changes/` 与 `.symphony/workflow/phases/`，Symphony 不校验 Gate、续跑 turn 丢失阶段上下文。团队讨论结论：**产物为唯一进度真相**、**WORKFLOW.md 为唯一流程配置**（含 `workflow.phases` 短表）、**取消 workpad**、**每阶段必有 change 根目录英文 md 产物**。

## What Changes

- **BREAKING**：废弃 V1.1 workpad Phase/Gate、`.symphony/workflow/phases/*/评审报告.md` 等路径；改为 `openspec/changes/{change_ref}/` 下六文件产物链。
- 在 **WORKFLOW.md YAML front matter** 增加 `workflow:` 段（`version`、`change_ref` 规则、`phases[]`：`id` / `handler` / `produces` / `requires_pass`）。
- Symphony **解析 workflow 配置**，按有序 phases **扫描产物**推导本 turn 目标阶段，向 Cursor agent 注入 `/{handler}` 与 `produces` 路径；**每 turn**（含续跑）均执行，不再使用固定英文续跑文案。
- **完成条件**：`requires_pass: false` → 文件存在；`true` → 存在且 YAML front matter `status: pass`。archive 阶段先写 `archive.md` 再 mv 至 `openspec/changes/archive/`。
- 更新 **docs**、**WORKFLOW 示例**、**Dashboard/artifact-store** 扫描逻辑；**symphony-openspec-bundle**（独立仓）skill 路径与命名对齐（实现任务中引用，非本仓 scope 全部）。
- **Non-Goals（本 change）**：失败阻塞、tracker 状态/评论回写、OpenSpec 自定义 schema artifact 图、install/bootstrap 自动化。

## Capabilities

### New Capabilities

- `workflow-v1-2-artifact-contract`：六阶段产物路径、有序依赖、`requires_pass` 与 archive 后路径约定。
- `workflow-phases-config`：从 WORKFLOW.md 解析 `workflow.phases` 配置 schema 与校验。
- `symphony-workflow-dispatch`：产物扫描推导当前阶段、turn Prompt 注入 handler/产物路径、移除对 workpad Phase 的依赖。

### Modified Capabilities

- （无）主规格库 `openspec/specs/` 尚无已归档 capability；V1.1 要求仅存在于历史 change 中，本 change 以 ADDED 规格为准。

## Impact

- **symphony-ts**：`config-resolver`、`prompt-builder` / `cursor-harness`、可选 `workflow/` 模块、`artifact-store`（manifest/scan）、`docs/symphony-agent-workflow.md`、`examples/*/WORKFLOW.md`。
- **symphony-openspec-bundle**（独立仓）：skill 产物路径、`openspec-verify` 命名、移除 workpad 模板依赖（协调任务，可 follow-up PR）。
- **BREAKING**：运行中 V1.1 workspace 需重新 install skills 并更新 WORKFLOW；Dashboard 阶段产物映射变更。
