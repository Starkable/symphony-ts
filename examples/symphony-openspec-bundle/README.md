# Symphony OpenSpec Bundle（独立仓库）

V1.1 定制化 OpenSpec **完整发行包**已迁移至独立 git 仓库，不再维护于 `examples/symphony-policy-bundle/`。

## 位置

与 `symphony-ts` **同级目录**（推荐 clone 路径）：

```
F:/project/symphony-openspec-bundle/
```

或团队 fork 后的任意路径，通过环境变量注入：

```powershell
$env:SYMPHONY_POLICY_ROOT = "F:\project\symphony-openspec-bundle"
```

## 安装

完整路径示例：`F:\project\symphony-openspec-bundle`（与 `symphony-ts` 仓库同级）。

```bash
bash "${SYMPHONY_POLICY_ROOT}/bootstrap/install.sh" "$(pwd)"
```

## symphony-ts 职责

- 提供 Symphony orchestrator 与 Dashboard
- **不再**作为业务 workspace 的 openspec/symphony skill 拷贝来源
- 文档：`docs/symphony-agent-workflow.md`

## 可选：git submodule

```bash
git submodule add <remote-url> vendor/symphony-openspec-bundle
export SYMPHONY_POLICY_ROOT="$(pwd)/vendor/symphony-openspec-bundle"
```
