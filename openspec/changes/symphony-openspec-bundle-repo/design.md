## Context

- **V1.1** 已选定方案 B 阶段顺序与 Dashboard 产物契约；定制 OpenSpec 意图放在「外部策略包」，但当前资产分散在 symphony-ts 多处
- **symphony-ts orchestrator** 不解析 skill 路径；运行时完全依赖 workspace 内 `.cursor/skills` + WORKFLOW prompt
- **OpenSpec CLI** 生成 `openspec-*` skills；版本随 CLI 升级；bundle 需 vendoring 快照并声明兼容版本
- 团队决策：**定制化 spec 独立 git 仓库**，symphony-ts 仅文档与集成点，不作为业务 skill 来源

## Goals / Non-Goals

**Goals:**

- 定义 **Portable OpenSpec Bundle** 独立仓库：单目录自包含，复制/clone 即可部署
- 仓库内包含：全部运行时 skills、`openspec/config.yaml`、报告/workpad 模板、`bootstrap/install`、`bundle.yaml`、中文 README
- skill 命名 **英文 slug**，内容 **简体中文**，结构 **对齐 openspec-* skill**（完整 Steps/Guardrails/输出格式）
- 移除 symphony-ts `.agents/skills/`；安装路径 **仅** `workspace/.cursor/skills/`
- symphony-ts 更新文档与 bootstrap 片段，只指向 `SYMPHONY_POLICY_ROOT` → 独立仓

**Non-Goals:**

- fork OpenSpec CLI 或修改 artifact 英文 id
- orchestrator 代码内 enforce Phase/skill（仍 Policy 约定）
- 在本 change 内创建真实 remote git 仓库（tasks 可含初始化脚本与文档；仓可由团队自行 `git init`）
- V2 Git/PR skills（commit/push）与 readonly subagent 恢复（除非未来单独 change）

## Decisions

### D1：独立仓库 vs symphony-ts 子目录

| 选项 | 结论 |
|------|------|
| **独立 git 仓库**（推荐） | ✅ 版本独立、团队 fork 改名即可定制、不污染 symphony-ts |
| `symphony-ts/examples/` 唯一真相源 | ❌ 仍易与 meta 仓 `.cursor/skills` 混淆 |

**仓库建议名**：`symphony-openspec-bundle`（团队 fork 可改 remote 名，改 `bundle.yaml` 的 `id`/`display_name`）。

symphony-ts `examples/symphony-policy-bundle/` **Deprecated** → README 指向独立仓或 git submodule。

### D2：Bundle 根目录结构

```
<bundle-root>/
├── bundle.yaml                 # id, version, openspec_cli, schema
├── README.md                   # 安装与复制说明（中文）
├── skills/                     # 安装 → workspace/.cursor/skills/
│   ├── openspec-explore/
│   ├── openspec-new-change/
│   ├── openspec-continue-change/
│   ├── openspec-apply-change/
│   ├── openspec-archive-change/
│   ├── symphony-v1-policy/
│   ├── symphony-clarify/
│   ├── symphony-proposal-review/
│   ├── symphony-plan/
│   └── symphony-verify/
├── openspec/
│   └── config.yaml
├── templates/
│   ├── workpad.md
│   └── reports/
│       ├── proposal-review.md
│       ├── verification.md
│       └── archive.md
├── docs/
│   └── phase-artifact-contract.md
└── bootstrap/
    ├── install.sh
    └── install.ps1
```

**备选**：skills 嵌套为 `bundle/.cursor/skills/` — 已拒绝（多一层；install 脚本负责映射到 workspace 标准路径即可）。

### D3：安装语义（唯一入口）

`bootstrap/install.sh <workspace-path>`：

1. 若 `$workspace/openspec/config.yaml` 不存在 → `openspec init --tools none`（需 CLI 在 PATH）
2. 覆盖 `$workspace/openspec/config.yaml` ← `$BUNDLE_ROOT/openspec/config.yaml`
3. `cp -R $BUNDLE_ROOT/skills/*` → `$workspace/.cursor/skills/`
4. 拷贝 `templates/reports/*` → `$workspace/.symphony/workflow/phases/{proposal_review,verify,archive}/`
5. 可选拷贝 `templates/workpad.md` → `$workspace/.symphony/workpad.md`（若不存在）
6. 写入 `$workspace/.symphony/policy-bundle.json`（id、version、installed_at、bundle_root）

`SYMPHONY_POLICY_ROOT` = bundle 根目录；`hooks.after_create` 调用 `install.sh "$(pwd)"`。

### D4：Skill 规范

| 规则 | 说明 |
|------|------|
| 目录/skill `name` | 英文 kebab-case |
| 正文 | 简体中文 |
| 结构 | frontmatter + Input + 前置 + Steps + 输出格式 + Guardrails + 与 openspec-* 分工 |
| `symphony-提案评审` | **RENAMED** → `symphony-proposal-review` |
| `.agents/skills/*` | **删除**；`symphony-v1-policy` 迁入 `skills/symphony-v1-policy/` |

openspec-* 从当前 symphony-ts `.cursor/skills/openspec-*` 拷贝进 bundle 作为 **vendored snapshot**；`bundle.yaml` 声明 `openspec_cli: ">=1.3.0"`（随实际 pin 调整）。

### D5：symphony-ts 侧变更

- 删除 `.agents/skills/` 整个目录
- 更新 `docs/snippets/openspec-workspace-bootstrap.sh`：仅 `install.sh` 分支，删除 `.agents` 拷贝
- 更新 `docs/symphony-agent-workflow.md`、`WORKFLOW.template.md`、示例 WORKFLOW
- `examples/symphony-policy-bundle/` → 替换为 `examples/symphony-openspec-bundle/README.md` 指向独立仓 + 可选 submodule 占位

### D6：与 symphony-workflow-v1-1 关系

- v1-1 已实现 Dashboard/manifest/部分策略包示例；本 change **不重复** Dashboard 代码，** supersede** 策略包布局与 skill 来源
- 实施顺序：可先完成本 change 的独立仓初始化，再回填 v1-1 文档引用

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| openspec CLI 升级与 vendored skill 不兼容 | `bundle.yaml` 锁版本；独立仓发版；CI 跑 `openspec --version` 检查 |
| 双仓同步滞后 | symphony-ts 文档只指向独立仓 tag；不在 ts 仓维护第二份 skills |
| 已有 workspace 旧 skills 残留 | install 文档说明 `--force` 或清理 `.cursor/skills/symphony-*` |
| Windows 无 bash | 提供 `install.ps1` 对等实现 |

## Migration Plan

1. 在独立仓初始化目录与 `bundle.yaml` v1.0.0
2. 从 symphony-ts 迁移/重写 skills 进独立仓 `skills/`
3. 删除 symphony-ts `.agents/skills/` 与旧 `examples/symphony-policy-bundle/` 内容
4. 更新 symphony-ts 文档与 bootstrap 片段
5. 团队设置 `SYMPHONY_POLICY_ROOT` 指向 clone 路径；新 workspace 跑 install
6. 已有 workspace：手动重跑 install 或等下一 issue workspace

**Rollback**：保留独立仓上一 tag；`SYMPHONY_POLICY_ROOT` 指回旧路径。

## Open Questions

- 独立仓托管位置（GitHub org / 内网 Git）— 团队运维决定
- `templates/reports` 文件名用英文还是中文 — 建议 **中文展示文件名**（与 Dashboard 契约一致）或 install 时映射
- 是否在 bundle 内包含精简版 `WORKFLOW.md` 片段 — 可选 `templates/WORKFLOW.policy-snippet.md`
