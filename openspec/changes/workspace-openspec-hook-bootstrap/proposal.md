## Why

V1 Policy 文档与 WORKFLOW 示例将 `npm install -g openspec` 写在 `hooks.after_create` 中，与团队约定不符：**openspec CLI 由人工在 Symphony 宿主机安装一次**；**每个 workspace 应在 hook 内完成 OpenSpec 仓库级初始化**（`openspec init` 或等价），因目标业务仓默认不含 `openspec/`。

## What Changes

- 更新 `docs/symphony-agent-workflow.md`：拆分「宿主机人工准备」与「after_create：OpenSpec 初始化」
- 更新 `docs/WORKFLOW.template.md`：移除 hook 内 CLI 安装；增加条件 `openspec init` 与自检
- 更新 `examples/workflow-cursor-policy/WORKFLOW.md` 与 `examples/workflow-pms-openspec/WORKFLOW.md` 的 `after_create`
- 新增可复用引导脚本片段 `docs/snippets/openspec-workspace-bootstrap.sh`（供 WORKFLOW 引用或复制）
- 试跑清单：宿主机 `openspec --version`；hook 后 workspace 存在 `openspec/config.yaml`

## Capabilities

### New Capabilities

- `workspace-openspec-bootstrap`：`after_create` 内 OpenSpec 初始化契约（不安装 CLI、条件 init、失败语义）

### Modified Capabilities

- `symphony-policy-v1-openspec`：前置依赖与试跑清单中 CLI 安装责任从 hook 改为宿主机

## Impact

- **文档与示例 only**；不改 orchestrator 代码
- 依赖：Symphony 运行环境已人工安装 `openspec` CLI
