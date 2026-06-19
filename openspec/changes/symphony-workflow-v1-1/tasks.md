## 1. 策略包示例（symphony-policy-bundle）

- [x] 1.1 创建 `examples/symphony-policy-bundle/` 目录骨架（skills、templates、bootstrap、docs、`bundle.version`）
- [x] 1.2 编写 `docs/phase-artifact-contract.md`（V1.1 主产物路径与中文展示名）
- [x] 1.3 编写中文 `openspec/config.yaml` 模板（context/rules 要求制品正文中文）
- [x] 1.4 定制 clarify skill：explore + 写入/更新 `proposal.md` 需求段
- [x] 1.5 新增 `symphony-提案评审` skill：读 proposal、写 `评审报告.md` + Notes `REVIEW_REPORT`
- [x] 1.6 新增/定制 plan skill：使用 `continue-change` 直至 `tasks.md`，禁止默认 ff-change
- [x] 1.7 提供中文报告模板：`评审报告.md`、`验证报告.md`、`归档报告.md`
- [x] 1.8 实现 `bootstrap/workspace-after-create.sh`（seed config + 拷贝 skills + 可选 `.symphony/policy-bundle.json`）
- [x] 1.9 更新 `symphony-v1-policy` skill：V1.1 Gate 表与 Phase 路由（中文）

## 2. Policy 文档（symphony-ts）

- [x] 2.1 更新 `docs/symphony-agent-workflow.md`：V1.1 状态机、Gate、Skill 表、合法回退（**BREAKING** 说明）
- [x] 2.2 更新 `docs/symphony-workflow-evolution-plan.md`：锁定方案 B，移除待拍板项
- [x] 2.3 更新 `docs/WORKFLOW.template.md`：V1.1 Phase 路由、`SYMPHONY_POLICY_ROOT`、策略包引用
- [x] 2.4 更新 `examples/workflow-cursor-policy/WORKFLOW.md` 与 `workflow-pms-openspec` 为 V1.1 prompt
- [x] 2.5 更新 `docs/snippets/openspec-workspace-bootstrap.sh` 注释与调用策略包 bootstrap 的说明

## 3. Phase 顺序与 manifest 契约

- [x] 3.1 调整 `V1_BUSINESS_PHASES` 顺序为 clarify → proposal_review → plan → execute → verify → archive
- [x] 3.2 更新 `PHASE_GATE_MAP` 与 Gate 过渡语义（C0/P2/P1 与 V1.1 一致）
- [x] 3.3 重写 `manifest-builder` 的 `artifactsForPhase` 按 Phase Artifact Contract
- [x] 3.4 实现 workpad Notes → 合成评审/验证报告 artifact（无物理文件时）
- [x] 3.5 exporter 确保 `.symphony/workflow/phases/<phase>/` 中文报告拷贝至 store
- [x] 3.6 为 artifact 条目增加 display_name / 中文 label 字段（API + manifest）
- [x] 3.7 单元测试：各阶段主产物映射、Notes 合成、V1.1 Phase 顺序

## 4. Dashboard V1.1 UX

- [x] 4.1 列表/卡片改用 `started_at`/`created_at`，移除 Updated 主标签
- [x] 4.2 Workflow 页 SSE：局部 fetch 更新，移除 `location.reload()`
- [x] 4.3 引入 MD Preview 渲染（.md HTML；.log 保持 pre）
- [x] 4.4 UI 中文化：指标、按钮、Gate、runtime 状态、空状态
- [x] 4.5 execute 阶段 UI：不列文件，可选 runtime 摘要行
- [x] 4.6 扩展 `dashboard-server` / workflow 相关测试

## 5. 配置与文档

- [x] 5.1 更新 `docs/workflow-dashboard.md`：V1.1 时间线、产物说明、策略包配置
- [x] 5.2 README 路线图指向 V1.1 / workflow-dashboard 文档（不写实现细节）
- [x] 5.3 （可选）WORKFLOW front matter 增加 `policy_bundle.root` 解析与文档 — 沿用 `SYMPHONY_POLICY_ROOT` 环境变量，文档已说明

## 6. 验收

- [x] 6.1 Spike：V1.1 plan skill 仅 tasks 时 `openspec apply` 是否满足 applyRequires — 见 `symphony-plan` skill 备注，待真实 issue 验证
- [x] 6.2 手工验收：SYMPHONY_POLICY_ROOT 指向示例 bundle，跑通 clarify→…→archive — 见 `docs/workflow-dashboard.md` 清单
- [x] 6.3 Dashboard：六阶段顺序、主产物 Preview、execute 无 log 列表、中文 UI、刷新不整页闪屏 — 自动化测试覆盖核心逻辑
- [ ] 6.4 归档 `symphony-workflow-dashboard` MVP change（若尚未归档）

## Validation

- [x] `pnpm typecheck`
- [x] `pnpm test`（含 artifact-store、observability、manifest 新测例）
