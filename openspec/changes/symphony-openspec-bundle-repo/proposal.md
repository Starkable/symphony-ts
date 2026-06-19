## Why

V1.1 已将 OpenSpec 流程定制拆到「策略包 + `SYMPHONY_POLICY_ROOT`」，但实现仍分散在 `symphony-ts/.cursor/skills`、`symphony-ts/.agents/skills` 与 `examples/symphony-policy-bundle/` 三处；复制 workspace 需拼装多目录，skill 命名与完整度不一致（中文目录名、内容过短、与 openspec-* 不同构）。团队希望 **定制化 OpenSpec 作为独立 git 仓库**，采用 **单一自包含目录**：复制（或 clone）→ 改目录名/配置 → `bootstrap/install` → 即可在任意 Symphony workspace 使用，无需再依赖 symphony-ts 作为 skill 来源。

## What Changes

- 定义 **Portable OpenSpec Bundle** 独立仓库契约：目录结构、`bundle.yaml` 元数据、版本与 OpenSpec CLI 兼容声明
- 仓库内 **vendoring 全部运行时 skill**（`openspec-*` 快照 + `symphony-*` 阶段 skill + `symphony-v1-policy` 横切），**统一置于 `skills/`**，安装时拷贝到 workspace `.cursor/skills/`；**删除对 `.agents/skills` 的依赖**
- skill **slug 全英文**（如 `symphony-proposal-review`），**正文与步骤说明简体中文**，结构对齐现有 `openspec-continue-change` 等（Input、Steps、Guardrails、输出格式、Gate/Workpad 更新）
- 提供 **单一安装入口** `bootstrap/install.sh`（及 Windows `install.ps1`）：openspec init（若缺失）→ 覆盖 config → 拷贝 skills/templates → 写入 `.symphony/policy-bundle.json`
- symphony-ts **仅保留**：文档引用、示例路径或 submodule 指针；**BREAKING**：不再文档化「从 symphony-ts 拷贝 openspec-* / `.agents/skills`」为运行时路径
- 移除 symphony-ts 内 `.agents/skills/`（commit/push/subagent 等 V2 遗留）；`examples/symphony-policy-bundle/` 由独立仓示例或 symlink 文档替代
- 更新 `symphony-workflow-v1-1` 相关文档/spec 中与旧策略包结构矛盾的描述（指向新仓库契约）

## Capabilities

### New Capabilities

- `portable-openspec-bundle`：独立仓库目录契约、`bundle.yaml`、skills/openspec/templates/docs 布局、版本与 CLI 兼容
- `bundle-install-bootstrap`：`install.sh` / `install.ps1` 行为、workspace 落盘路径、审计文件 `.symphony/policy-bundle.json`
- `symphony-v1-skills`：V1.1 阶段 skill 集合（英文 name、中文正文、完整步骤）、与 openspec-* 分工、移除 `.agents/skills`
- `symphony-ts-bundle-integration`：symphony-ts 如何引用独立仓（`SYMPHONY_POLICY_ROOT`、WORKFLOW 示例、文档、不再 vendoring skill）

### Modified Capabilities

- `policy-bundle-integration`（delta，`symphony-workflow-v1-1`）：策略包最低结构改为单仓库自包含；去掉 `.agents/skills/symphony-v1-policy` 要求

## Impact

- **新 git 仓库**（建议名 `symphony-openspec-bundle` 或团队自定）：承载全部定制化 OpenSpec 资产
- **symphony-ts**：删除 `.agents/skills/`；更新 bootstrap 片段与 Policy 文档；可选保留 `examples/` 下 README 指向独立仓
- **现有 workspace**：重新执行 bundle install 以刷新 skills；无 orchestrator 代码变更（仍不解析 skill 路径）
- **运维**：`SYMPHONY_POLICY_ROOT` 指向独立仓根目录；团队 fork 后仅改 `bundle.yaml` 与目录名即可差异化
