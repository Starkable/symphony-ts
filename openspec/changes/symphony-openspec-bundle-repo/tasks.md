## 1. 独立 bundle 仓库初始化

- [x] 1.1 创建独立 git 仓库（建议名 `symphony-openspec-bundle`），按 design 落地根目录：`bundle.yaml`、`README.md`、`skills/`、`openspec/`、`templates/`、`docs/`、`bootstrap/`
- [x] 1.2 编写 `bundle.yaml`（id、display_name、version、openspec_cli、schema）
- [x] 1.3 编写中文 `README.md`：clone/复制、`SYMPHONY_POLICY_ROOT`、install 用法、fork 改名说明

## 2. Vendoring openspec-* skills

- [x] 2.1 从 symphony-ts `.cursor/skills/` 拷贝 openspec 核心五件套至 bundle `skills/`：explore、new-change、continue-change、apply-change、archive-change
- [x] 2.2 在 bundle README 记录 openspec CLI 兼容版本与更新 vendoring 流程
- [x] 2.3 （可选）拷贝 openspec-propose、verify-change 等扩展 skill 并注明非 V1.1 必需

## 3. Symphony V1.1 skills（英文 slug + 中文完整正文）

- [x] 3.1 迁移并重写 `skills/symphony-v1-policy/`（从 `.agents/skills` 迁入，更新路径引用）
- [x] 3.2 重写 `skills/symphony-clarify/`（完整 Steps/Guardrails/输出格式）
- [x] 3.3 新建 `skills/symphony-proposal-review/`（替换 `symphony-提案评审`，合并原 subagent 检查项）
- [x] 3.4 重写 `skills/symphony-plan/`（禁止默认 ff-change，指向 continue-change）
- [x] 3.5 新建 `skills/symphony-verify/`（Validation 命令、VERIFICATION_REPORT、报告文件）
- [x] 3.6 添加 `skills/_template/SKILL.template.md` 供后续 skill 统一结构

## 4. openspec config 与模板

- [x] 4.1 迁移中文 `openspec/config.yaml` 至 bundle
- [x] 4.2 迁移 `templates/reports/`（评审/验证/归档）与 `templates/workpad.md`
- [x] 4.3 迁移 `docs/phase-artifact-contract.md`

## 5. Bootstrap 安装脚本

- [x] 5.1 实现 `bootstrap/install.sh`（init、config 覆盖、skills 拷贝、模板部署、policy-bundle.json）
- [x] 5.2 实现 `bootstrap/install.ps1`（Windows 对等行为）
- [x] 5.3 支持重复 install 幂等与可选 `--force` 文档说明

## 6. symphony-ts 清理与集成

- [x] 6.1 删除 symphony-ts `.agents/skills/` 整个目录
- [x] 6.2 废弃或移除 `examples/symphony-policy-bundle/` 完整副本，新增 `examples/symphony-openspec-bundle/README.md` 指向独立仓（可选 submodule）
- [x] 6.3 简化 `docs/snippets/openspec-workspace-bootstrap.sh`：仅调用 bundle `install.sh`
- [x] 6.4 更新 `docs/symphony-agent-workflow.md`：Skills 索引、V1.1 路径、移除 `.agents` 与「从 ts 拷 openspec-*」
- [x] 6.5 更新 `docs/WORKFLOW.template.md`、`examples/workflow-cursor-policy/`、`examples/workflow-pms-openspec/`
- [x] 6.6 更新 `docs/symphony-workflow-evolution-plan.md` 与 README 路线图

## 7. 验收

- [x] 7.1 在新 workspace 执行：`SYMPHONY_POLICY_ROOT=<bundle>` + `install.sh`，确认仅 `.cursor/skills` 无 `.agents/skills`
- [x] 7.2 确认全部 symphony skill 为英文目录名、中文正文、结构完整（spot check 行数与章节）
- [x] 7.3 确认 `policy-bundle.json` 与 `bundle.yaml` version 一致
- [x] 7.4 手工跑通 V1.1 Phase 路由文档对照（clarify→…→archive skill 映射表）

## Validation

- [x] `pnpm typecheck`（若仅文档/skill 变更可 N/A，删 ts 引用时仍跑）
- [x] 独立仓内 README 安装步骤可由他人按文档复现
