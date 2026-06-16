---
name: commit
description:
  根据当前改动与 Workpad 上下文创建规范 git commit；在 execute/submit 阶段使用。
---

# Commit

## 目标

- commit 内容与 Workpad Plan、ChangeRef 一致
- 遵循本仓库 AGENTS.md：短祈使句 subject，聚焦 why

## 步骤

1. 读 `.symphony/workpad.md` 确认 Phase 为 `execute` 或 `submit`
2. `git status`、`git diff`、`git diff --staged`
3. 确认不包含 `.symphony/` 中不应提交的文件（除非团队 policy 允许）
4. `git add` 仅 scope 内文件
5. Subject：祈使句，≤72 字符，无句末句号（例：`Add validation gate for cursor policy`）
6. Body（可选）：Summary、Tests 命令与结果
7. `git commit -F <file>` 使用文件传递多行 message

## 禁止

- Phase 为 `clarify` / `blocked` / `plan` / `proposal_review` / `verify` 时创建实现性 commit
