## Why

Symphony 现有 HTTP Dashboard 仅展示 orchestrator 运行时指标（running/retry、token、tracker State），无法反映 V1 Policy 工作流的 Phase、Gate 与阶段产物。工单 workspace 在 terminal 状态或重启 cleanup 时会被销毁，阶段文档若只留在 workspace 内将一并丢失，运维无法在网页上追溯完整流程。

团队已有 UI 原型（symphony-obs：三页布局、蓝色主色、横向/纵向时间线、产物 Preview），且已明确：**界面只参考原型样式；数据与阶段模型以 V1 Policy + Artifact Store 为准**（完整 8 Phase、manifest、统一持久目录）。现需将上述结论固化为可实现的 OpenSpec change。

## What Changes

- 新增可配置 **Artifact Store**（`artifact_store.root`）：按 `issue_identifier`（如 `BCS-423/`）持久化 manifest、阶段证明文档、openspec 制品副本、turn/validation 日志
- 新增 **Workflow Exporter**：在 turn 结束、Gate 通过、`before_remove` 时从 workspace 同步到 store
- 扩展 **Dashboard HTTP API**：Workflow 列表/详情、产物安全读取；保留现有 `/api/v1/state` 与 SSE
- 新增 **三页 Workflow UI**（样式参考 symphony-obs，主色 blue-600）：总览（Active 卡片 + 8 节点时间线）、需求详情（纵向时间线 + MD/LOG Preview）、历史归档
- 可选 **hydrate**：workspace 重建时从 store 回灌 workpad/openspec（Phase 3）
- **不修改** orchestrator Phase 门控逻辑；V1 仍由 agent + workpad 推进，Dashboard 只读
- **不做** V1 人机按钮（Action Required / Take Task）；Preview 优先 MD/LOG，非 PDF 为主

## Capabilities

### New Capabilities

- `artifact-store`：统一持久目录、manifest schema、workspace→store 导出与可选 hydrate
- `workflow-dashboard`：Workflow REST API、产物读取、三页 Dashboard UI（参考 symphony-obs 样式）

### Modified Capabilities

（无：`openspec/specs/` 尚无已归档 capability；本 change 以新增 spec 为主。）

## Impact

- **代码**：`src/observability/`（Dashboard 路由与渲染）、新增 `src/artifact-store/` 或等价模块、`src/orchestrator/runtime-host.ts`（export 钩子）、`src/config/`（`artifact_store` 配置）
- **配置**：`WORKFLOW.template.md` / `docs/` 补充 `artifact_store.root`；与 `workspace.root` 独立
- **文档**：`docs/` 运维说明（store 路径、retention）；README 路线图「本地看板 GUI」可引用本 change
- **依赖**：无新外部依赖；复用现有 Dashboard server、workspace path safety
- **关系**：依赖 V1 Policy 约定（`docs/symphony-agent-workflow.md`、workpad、openspec changes）；与 `policy-v1-openspec-default` 互补，不重复 Policy 层定义
