---
name: symphony-v1-policy
description:
  Symphony V1 Policy 横切约束：ChangeRef 绑定、禁止 AskUserQuestion、Phase 允许/禁止摘要。与 docs/symphony-agent-workflow.md 一致。
---

# Symphony V1 Policy（OpenSpec 默认）

## 适用

- Workpad `Mode: v1-openspec`
- Symphony 无人值守 dispatch（无用户在环）

## 硬约束

1. **ChangeRef** = `issue.identifier` 的 kebab-case；仅操作 `openspec/changes/<ChangeRef>/`
2. **禁止** AskUserQuestion 选择 change 或确认显而易见的事项
3. **每 turn** 先读 `.symphony/workpad.md` Phase，只执行该 Phase 允许动作
4. **禁止跳步**（除 Gate 合法回退：verify→execute、review fail→plan 等）
5. C0 未过：**禁止**改 `src/`/`tests/`、禁止 `openspec new` / apply
6. 高影响 unknown 不可推断 → `Phase=failed`，Notes `CLARIFY_BLOCKED:`，正常结束 turn

## Phase 摘要

| Phase | 做 | 不做 |
|-------|-----|------|
| clarify | explore | 写产品代码 |
| plan | ff-change / propose | 写产品代码 |
| proposal_review | REVIEW_REPORT | 写产品代码 |
| execute | apply | 自证 verify |
| verify | Validation 命令 + VERIFICATION_REPORT | 进 archive 无 PASS |
| archive | archive-change | — |

## OpenSpec skills 路径

`.cursor/skills/openspec-explore|ff-change|apply-change|archive-change/SKILL.md`

## 报告格式

- 评审：`REVIEW_REPORT: PASS|FAIL`
- 验证：`VERIFICATION_REPORT: PASS|FAIL`（含命令 exit code）

## V1 不使用

`commit`、`push`、`qa-verify-subagent`、`proposal-review-subagent`（见文档 V2 节）
