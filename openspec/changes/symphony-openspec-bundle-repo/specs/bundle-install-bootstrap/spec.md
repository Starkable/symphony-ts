## ADDED Requirements

### Requirement: 单一安装入口

Bundle SHALL 提供 `bootstrap/install.sh` 作为 **唯一** 推荐安装入口，接受参数 `<workspace-path>`；SHALL 提供 Windows 对等脚本 `bootstrap/install.ps1`。

#### Scenario: install 拷贝 skills

- **WHEN** 操作者执行 `bootstrap/install.sh /path/to/workspace`
- **THEN** `$BUNDLE_ROOT/skills/*` SHALL 被拷贝到 `/path/to/workspace/.cursor/skills/`
- **AND** SHALL NOT 写入 `/path/to/workspace/.agents/skills/`

#### Scenario: install 初始化 openspec

- **WHEN** workspace 不存在 `openspec/config.yaml`
- **AND** 宿主机 `openspec` CLI 可用
- **THEN** install SHALL 执行 `openspec init --tools none`
- **AND** 随后 SHALL 用 bundle 内 config 覆盖

#### Scenario: install 部署报告模板

- **WHEN** install 成功完成
- **THEN** bundle `templates/reports/` 下文件 SHALL 出现在 workspace `.symphony/workflow/phases/` 对应阶段目录

### Requirement: SYMPHONY_POLICY_ROOT 约定

文档 SHALL 规定：宿主机环境变量 `SYMPHONY_POLICY_ROOT` SHALL 指向 bundle 仓库根目录；`hooks.after_create` SHALL 调用 `$SYMPHONY_POLICY_ROOT/bootstrap/install.sh "$(pwd)"`。

#### Scenario: after_create 集成

- **WHEN** Symphony workspace 创建且 `SYMPHONY_POLICY_ROOT` 已设置
- **THEN** after_create hook SHALL 能成功调用 install 且无 `.agents/skills` 拷贝步骤

### Requirement: 安装审计文件

install SHALL 写入或更新 `workspace/.symphony/policy-bundle.json`，包含 `id`、`version`、`installed_at`、以及 bundle 根路径（`bundle_root`）。

#### Scenario: 重复 install 幂等

- **WHEN** 对同一 workspace 重复执行 install
- **THEN** skills 与 config SHALL 被覆盖为 bundle 当前版本
- **AND** `policy-bundle.json` SHALL 更新 `installed_at` 与 `version`
