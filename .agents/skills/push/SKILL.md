---
name: push
description:
  推送当前分支并创建或更新 PR；在 submit 阶段使用。推送前须已通过 V1（VERIFICATION_REPORT: PASS）。
---

# Push

## 前置

- `gh auth status` 成功
- Workpad Phase 为 `submit`
- Workpad Gate Log 中 V1 为 pass

## 步骤

1. `branch=$(git branch --show-current)`
2. 运行 Workpad Validation 中的命令（或确认 V1 已通过）
3. `git push -u origin HEAD`（非 fast-forward 时先 merge/rebase main，再推）
4. PR：
   - 无 PR：`gh pr create --title "<清晰标题>" --body-file <body.md>`
   - 有 PR：更新 title/body 反映**整分支** scope
5. PR body 须含：ChangeRef、Workpad 摘要、Validation 命令与结果
6. 输出 PR URL：`gh pr view --json url -q .url`
7. Workpad `Phase` → `handoff`，Notes 记 PR 链接

## 禁止

- 无 `VERIFICATION_REPORT: PASS` 时 push
- 对已 MERGED/CLOSED 的分支强行复用；应新分支 + 新 PR
