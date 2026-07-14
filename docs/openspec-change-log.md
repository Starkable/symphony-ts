# OpenSpec Change 清理总结

> 生成日期：2026-07-15。本地 `openspec/changes/` 已清空过时/已落地提案；**能力真相以本仓代码 + 下列文档为准**。  
> 说明：`/openspec/` 在 `.gitignore` 中，开发期 change 默认不入库；可归档记录集中写在本文，避免 change 堆叠失控。

## 1. 当前能力地图（已实现）

```
┌─ Tracker ──────────────────────────────────────────────┐
│  Linear | PMS（只读 + 写回）                            │
└─────────────────────────────┬──────────────────────────┘
                              │
┌─ Orchestrator / V1.2 ───────▼──────────────────────────┐
│  workflow.phases → 产物扫描推导 effective_phase         │
│  skill id → 读 .agents/skills/<id>/SKILL.md → 内联 prompt│
│  全产物完成 → harness 停机（harness_stop_workflow_done） │
└─────────────────────────────┬──────────────────────────┘
                              │
┌─ Agent Harness ─────────────▼──────────────────────────┐
│  codex | cursor | claude                                │
│  Skill 与 CLI 无关（无 /skill、$skill、handler）         │
└─────────────────────────────┬──────────────────────────┘
                              │
┌─ Policy Bundle ─────────────▼──────────────────────────┐
│  symphony-openspec-bundle                               │
│  install → workspace/.agents/skills/                    │
└────────────────────────────────────────────────────────┘
```

| 能力 | 状态 | 入口文档 / 样例 |
|------|------|-----------------|
| V1.2 产物驱动六阶段 | ✅ | [symphony-agent-workflow.md](./symphony-agent-workflow.md) |
| Skill 安装根 `.agents/skills` + 正文内联 | ✅ | 同上；bundle：[symphony-workflow-v1-2-bundle-coordination.md](./symphony-workflow-v1-2-bundle-coordination.md) |
| Codex / Cursor / Claude harness | ✅ | [agent-harness.md](./agent-harness.md) |
| Codex Policy 样例 | ✅ | [examples/workflow-codex-policy](../examples/workflow-codex-policy/)、[codex-policy-smoke.md](./codex-policy-smoke.md) |
| Claude Policy 样例 | ✅ | [examples/workflow-claude-policy](../examples/workflow-claude-policy/) |
| Cursor Policy 样例 | ✅ | [examples/workflow-cursor-policy](../examples/workflow-cursor-policy/) |
| PMS tracker + 写回 | ✅ | [pms-tracker.md](./pms-tracker.md)、[pms-field-mapping.md](./pms-field-mapping.md) |
| Workflow Dashboard / artifact_store | ✅（hydrate/SSE 可选未做） | [workflow-dashboard.md](./workflow-dashboard.md) |
| 多仓 / likou 模式 | ✅ | [multi-repo-workspace.md](./multi-repo-workspace.md) |

**约定（硬切，无兼容层）**

- Policy skill **唯一根**：`.agents/skills/<id>/SKILL.md`
- 禁止：`workflow.phases[].handler`、编排依赖 CLI 原生 `/skill` 或 `$skill`
- 进度真相：`openspec/changes/{change_ref}/` 六英文产物文件

---

## 2. 已清理的 change 清单

下列提案功能已在代码/文档落地；**残留未勾任务均为手工 e2e / 可选项**（由使用方自行验证）。提案目录已从 `openspec/changes/` **删除**，避免与现行契约冲突。

### 2.1 近期主线（2026-07，Skill / Harness）

| Change | 结论 |
|--------|------|
| `skill-cli-decouple` | ✅ `.agents/skills` + prompt 内联；去 handler / Cursor 绑定 |
| `bundle-agents-skills-install` | ✅ 独立仓 install 硬切到 `.agents/skills`（外仓跟进） |
| `codex-policy-smoke` | ✅ Codex + V1.2 样例与 stub 验收 |
| `claude-code-harness` | ✅ `agent.harness: claude` 第三条 CLI backend |
| `workflow-skill-only-dispatch` | ✅ phase 只 dispatch skill（已被上述硬切继承） |
| `optimize-bundle-v12-skills` | ✅ V1.2 白名单 skill 收敛 |
| `standardize-multi-repo-workflow` / `multi-repo-scope-and-shared-skills` / `likou-*` | ✅ 多仓与 likou 规范化 |

### 2.2 Workflow / Dashboard / PMS（此前主线）

| Change | 结论 |
|--------|------|
| `symphony-workflow-v1-2-artifact-driven` | ✅ V1.2 产物驱动；残留为可选 Cursor `/{handler}` spike（已过时，不再跟） |
| `stop-harness-on-workflow-done` | ✅ 代码已接；残留手工 e2e |
| `fix-v12-pms-writeback-and-phase-derivation` | ✅ 代码已接；残留手工 e2e |
| `symphony-openspec-bundle-repo` | ✅ 独立仓模型 |
| `symphony-workflow-dashboard` | ✅ MVP；未做 hydrate / live SSE（刻意延期） |
| `add-pms-tracker-readonly` / `pms-tracker-readwrite` / `pms-bcs-integration-verify` | ✅ PMS 读写与写回主路径；残留手工 smoke |
| `fix-terminal-cleanup-export-gate` | ✅ 主干逻辑；残留手工验收 |
| `fix-cursor-cli-harness` | ✅ Cursor stream-json harness；残留手工 resume/Windows 校验 |

### 2.3 过时 / 被取代（删除）

| Change | 为何删除 |
|--------|----------|
| `symphony-workflow-v1-1` | 被 V1.2 产物驱动取代（workpad Phase/Gate 不再是进度真相） |
| `policy-v1-openspec-default` | 被 `skill-cli-decouple` + V1.2 文档取代 |
| `add-cursor-agent-workflow-policy` | 早期 Cursor Policy；已被 agent-workflow + 样例取代 |
| `workspace-openspec-hook-bootstrap` | 已被 bundle bootstrap + snippets 吸收 |
| `localize-readme-zh` | 一次性文档工作，已合入 README |

---

## 3. 刻意未做 / 仍可选

| 项 | 说明 |
|----|------|
| `artifact_store.hydrate_on_create` | Dashboard change 明确不做/可另开 |
| `GET .../live` SSE tail | 501 / 可选 |
| Claude / Codex **真机**全链路 smoke | 功能已实现；联调由使用方补 |
| Dashboard UX 深度（无整页 reload、MD Preview 等） | 见演进文档「后续可选」 |

---

## 4. 新开 change 时怎么做

1. 先读：**本文件** + [symphony-agent-workflow.md](./symphony-agent-workflow.md) + [agent-harness.md](./agent-harness.md)。  
2. 用 OpenSpec 新建 change（如 `/opsx:propose`）；实现后及时 **archive 或删除**，并回写本节表格。  
3. **禁止**把业务工单流程写进本仓 `openspec/` 当长期规格；业务 skill 在 `symphony-openspec-bundle`。  
4. 产品行为冲突时以 `SPEC.upstream.md` / 本仓实现文档为准（见 `AGENTS.md`）。

---

## 5. 相关文档索引

| 文档 | 用途 |
|------|------|
| [symphony-agent-workflow.md](./symphony-agent-workflow.md) | V1.2 Policy 契约 |
| [agent-harness.md](./agent-harness.md) | Codex / Cursor / Claude |
| [symphony-workflow-v1-2-bundle-coordination.md](./symphony-workflow-v1-2-bundle-coordination.md) | 与 bundle 协同 |
| [symphony-workflow-evolution-plan.md](./symphony-workflow-evolution-plan.md) | 演进背景（已收敛为现状索引） |
| [multi-repo-workspace.md](./multi-repo-workspace.md) | 多仓 |
| [DEV_GUIDE.md](./DEV_GUIDE.md) | 安装与运行 |
| [WORKFLOW.template.md](./WORKFLOW.template.md) | 全量配置字段 |
