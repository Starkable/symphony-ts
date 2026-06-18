## ADDED Requirements

### Requirement: OpenSpec CLI 宿主机安装

Symphony V1 Policy 文档 SHALL 规定：`openspec` CLI 由操作者在 Symphony **宿主机**人工安装并验证（`openspec --version`），SHALL NOT 在 `hooks.after_create` 中安装 CLI。

#### Scenario: 文档职责划分

- **WHEN** 阅读 V1 前置依赖或宿主机准备章节
- **THEN** 文档 SHALL 列出宿主机 CLI 检查项且 SHALL NOT 将 `npm install -g openspec` 列为 after_create 推荐步骤

### Requirement: after_create OpenSpec 初始化

`hooks.after_create` SHALL 在 workspace 工作目录内：于 clone 与业务依赖安装之后，若不存在 `openspec/config.yaml`，则执行 OpenSpec 初始化（`openspec init` 或文档规定的等价操作）。

#### Scenario: 目标仓无 openspec 目录

- **WHEN** after_create 完成 clone 且 `openspec/config.yaml` 不存在
- **THEN** hook SHALL 运行 openspec init 且完成后 SHALL 存在 `openspec/config.yaml`

#### Scenario: 目标仓已含 openspec

- **WHEN** clone 后已存在 `openspec/config.yaml`
- **THEN** hook SHALL NOT 重复初始化

#### Scenario: 宿主机未安装 CLI

- **WHEN** hook 运行 `openspec --version` 失败
- **THEN** hook SHALL 以非零退出码失败

## MODIFIED Requirements

### Requirement: Workpad 瘦身

V1 模式下 workpad SHALL NOT 重复存储 Plan、Acceptance Criteria、Validation 正文；上述内容 SHALL 以 `openspec/changes/<ChangeRef>/` 内制品为权威。OpenSpec **仓库骨架**（`openspec/config.yaml` 等）SHALL 由 `hooks.after_create` 初始化或随目标仓 clone 提供，SHALL NOT 假设目标业务仓默认包含。

#### Scenario: plan 阶段更新制品

- **WHEN** Phase 为 `plan` 且 workspace 已完成 after_create
- **THEN** `openspec/config.yaml` SHALL 存在且 agent MAY 创建 `openspec/changes/<ChangeRef>/`
