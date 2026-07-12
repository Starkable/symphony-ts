# symphony-openspec-bundle V1.2 协调清单

symphony-ts V1.2 实现产物驱动阶段推导；**openspec skill 写文件**仍在独立仓 `symphony-openspec-bundle` 完成。本页列出 bundle 需同步项（非 symphony-ts 仓内实现）。

## Canonical skill 列表（WORKFLOW `skill` 字段）

| Phase | skill | 写入路径 | front matter |
|-------|-------|----------|--------------|
| clarify | `openspec-new-change` | `openspec/changes/{change_ref}/proposal.md` | 无 |
| proposal_review | `openspec-proposal-review` | `proposal_review.md` | `status: pass\|fail` |
| plan | `openspec-continue-change` | `tasks.md` | 无 |
| execute | `openspec-apply-change` | `execute.md` | apply 成功时 `status: pass` |
| verify | `openspec-verify` | `verification.md` | `status: pass\|fail` |
| archive | `openspec-archive-change` | `archive.md`（mv 前写入 active 路径） | `status: pass` |

横切查阅：`symphony-v1-policy`（install 白名单第 7 项；**硬约束由 Prompt 注入**）。

> bundle 已移除 `symphony-*` 别名、`openspec-propose`、`openspec-explore`。白名单见 bundle `bootstrap/v12-skills.txt`。

## Prompt 注入（symphony-ts）

每 turn `appendWorkflowDispatchSection` 注入两段：

1. **`## Symphony Workflow (V1.2)`** — `change_ref`、`effective_phase`、`skill`、`produces`
2. **`## Symphony Policy (V1.2)`** — ChangeRef 目录、禁止 AskUserQuestion、禁止跳步、禁止未授权 push

phase skill 正文不应重复 Policy 全文；见 bundle `skills/_template/symphony-v1.2-preamble.md`。

## 单仓 / 多仓 clarify

| 模式 | clarify 完成条件 | scope.json |
|------|------------------|------------|
| 单仓 | `proposal.md` 存在 | 不强制 |
| 多仓 | `proposal.md` + 有效 `scope.json` | 必填；MCP 发现 |

## Skill 行为

- 验证 skill 统一为 **`openspec-verify`**
- `openspec-proposal-review` 写 `proposal_review.md`，不再写 `.symphony/workflow/phases/`
- `openspec-apply-change` 成功结束时写 **`execute.md` + status: pass**

## Install 变更

- **移除**对 `.symphony/workflow/phases/` 中文模板拷贝
- 按 `v12-skills.txt` 白名单逐 skill symlink/junction 至 `.cursor/skills/`

## V1.2 薄 Prompt 片段（可粘贴至 WORKFLOW body）

```markdown
ChangeRef = kebab-case({{ issue.identifier }})；仅操作 openspec/changes/<ChangeRef>/。
Symphony 每 turn 注入 effective_phase、skill、produces 与 Policy 段 — 按注入执行，勿在正文写 Phase 路由表。
```

## WORKFLOW front matter 片段

见 [symphony-agent-workflow.md](./symphony-agent-workflow.md#配置仅-workflow-front-matter) 完整 `workflow.phases` 示例（使用 `skill` 字段）。
