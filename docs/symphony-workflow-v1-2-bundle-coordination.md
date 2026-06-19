# symphony-openspec-bundle V1.2 协调清单

symphony-ts V1.2 实现产物驱动阶段推导；**openspec skill 写文件**仍在独立仓 `symphony-openspec-bundle` 完成。本页列出 bundle 需同步项（非 symphony-ts 仓内实现）。

## 六产物路径（change 根目录，英文文件名）

| Phase | Skill / handler | 写入路径 | front matter |
|-------|-----------------|----------|--------------|
| clarify | `openspec-new-change` | `openspec/changes/{change_ref}/proposal.md` | 无 |
| proposal_review | `openspec-proposal-review` | `proposal_review.md` | `status: pass\|fail` |
| plan | `openspec-continue-change` | `tasks.md` | 无 |
| execute | `openspec-apply-change` | `execute.md` | apply 成功时 `status: pass` |
| verify | `openspec-verify` | `verification.md` | `status: pass\|fail` |
| archive | `openspec-archive-change` | `archive.md`（mv 前写入 active 路径） | `status: pass` |

## Skill 重命名与行为

- 验证 skill 统一为 **`openspec-verify`**（与 `openspec-verify-change` 拆分/重命名）
- `openspec-proposal-review` 写 `proposal_review.md`，不再写 `.symphony/workflow/phases/`
- `openspec-apply-change` 成功结束时写 **`execute.md` + status: pass**

## Install 变更

- **移除**（或标 deprecated）对 `.symphony/workflow/phases/` 中文模板拷贝
- 保留 `openspec init` + skill vendoring 至 `.cursor/skills/`

## V1.2 薄 Prompt 片段（可粘贴至 WORKFLOW body）

```markdown
ChangeRef = kebab-case({{ issue.identifier }})；仅操作 openspec/changes/<ChangeRef>/。
禁止 AskUserQuestion 选择 change；禁止未授权 git push。
Symphony 每 turn 注入 effective_phase、handler 与 produces 路径 — 按注入执行，勿跳步。
```

## WORKFLOW front matter 片段

见 [symphony-agent-workflow.md](./symphony-agent-workflow.md#配置仅-workflow-front-matter) 完整 `workflow.phases` 示例。
