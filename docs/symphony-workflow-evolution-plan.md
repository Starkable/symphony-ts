# Symphony Workflow 演进说明

> 历史讨论已收敛。**现行能力与已清理 OpenSpec 提案清单**见 [openspec-change-log.md](./openspec-change-log.md)。  
> 本文只保留仍有用的架构原则与**可选后续**，避免与 V1.1/workpad 叙述冲突。

## 现行基线（2026-07）

| 能力 | 状态 | 文档 |
|------|------|------|
| V1.2 产物驱动（六阶段 / 六文件） | ✅ | [symphony-agent-workflow.md](./symphony-agent-workflow.md) |
| Skill 根 `.agents/skills` + 编排内联 | ✅ | 同上；[bundle 协调](./symphony-workflow-v1-2-bundle-coordination.md) |
| Harness：`codex` / `cursor` / `claude` | ✅ | [agent-harness.md](./agent-harness.md) |
| Dashboard + artifact_store MVP | ✅ | [workflow-dashboard.md](./workflow-dashboard.md) |
| PMS 读写与写回 | ✅ | [pms-tracker.md](./pms-tracker.md) |
| `hydrate_on_create` / live SSE | ⏸ 刻意未做 | — |

**BREAKING（相对早期 V1.1）**：进度真相为 `openspec/changes/{change_ref}/` 英文产物，**不是** workpad Phase/Gate。

## 三层所有权（仍有效）

```
Symphony Policy（WORKFLOW.md + phases + 编排内联 Skill）
        ↓
外部策略包 symphony-openspec-bundle（skills / bootstrap / 模板）
        ↓
issue workspace（openspec/changes/<ChangeRef>/ + .symphony/）
        ↓
symphony-ts（orchestrator + harness + Dashboard）
```

| 路径 | 用途 |
|------|------|
| `symphony-ts/openspec/` | 本仓开发期 change（通常 gitignore）；历史见 [openspec-change-log.md](./openspec-change-log.md) |
| `SYMPHONY_POLICY_ROOT` → bundle | 团队维护 Policy skills |
| `workspace/openspec/` | 工单运行时实例 |

**禁止**：把业务工单流程长期堆在 `symphony-ts/openspec/changes/` 且不清理。

## Bundle 结构（已实现）

```
symphony-openspec-bundle/
├── skills/                 → install → workspace/.agents/skills/
├── bootstrap/install.{sh,ps1}
├── bootstrap/v12-skills.txt
└── docs/phase-artifact-contract.md
```

```powershell
$env:SYMPHONY_POLICY_ROOT = "F:/project/symphony-openspec-bundle"
```

## 可选后续（未开 change）

| 方向 | 说明 |
|------|------|
| Dashboard UX | 局部刷新代替整页 reload；MD Preview；文案中文化 |
| manifest 产物映射 | 按契约收紧 Dashboard 展示，弱化无关文件 |
| Claude/Codex 真机 smoke | 功能已接线；联调清单见 [codex-policy-smoke.md](./codex-policy-smoke.md) 与 Claude 样例 |
| hydrate / live SSE | 仅当有明确产品需求再开 change |

## 相关文档

- [openspec-change-log.md](./openspec-change-log.md) — **提案清理总结（主入口）**
- [symphony-agent-workflow.md](./symphony-agent-workflow.md) — V1.2 Policy
- [agent-harness.md](./agent-harness.md) — Harness
- [workflow-dashboard.md](./workflow-dashboard.md) — Dashboard
- [multi-repo-workspace.md](./multi-repo-workspace.md) — 多仓
