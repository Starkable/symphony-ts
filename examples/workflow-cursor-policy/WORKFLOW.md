---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: YOUR_PROJECT_SLUG
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed
    - Cancelled
    - Canceled
    - Duplicate

polling:
  interval_ms: 30000

workspace:
  root: ~/symphony_workspaces

hooks:
  after_create: |
    git clone --depth 1 'https://github.com/your-org/your-repo.git' .
    pnpm install
  before_run: |
    git status --short

agent:
  harness: cursor
  max_concurrent_agents: 3
  max_turns: 25

harnesses:
  cursor:
    command: agent
    mode: force
    reuse_policy: per_issue
    turn_timeout_ms: 3600000
    turn_log_workspace_artifact: true

server:
  port: 4321
---

你正在处理工作项 {{ issue.identifier }}：{{ issue.title }}。

{% if attempt %}
续跑上下文：第 {{ attempt }} 次 worker 续派；从 `.symphony/workpad.md` 当前 Phase 继续，勿重复已完成步骤。
{% endif %}

## 首要动作

1. 读取或初始化 `.symphony/workpad.md`（模板见仓库 `docs/symphony-agent-workflow.md`）
2. 根据 Workpad **Phase** 执行本 turn **唯一**允许的动作
3. turn 结束前更新 Workpad 与 Gate Log

## Phase 路由

| Phase | 允许 | 禁止 |
|-------|------|------|
| clarify | 澄清、Assumptions、写 AC 草案 | 改 src/tests、implement commit |
| blocked | 检查 Notes 是否有人回复 `[CLARIFY]`；无则立即结束 turn | 任何代码改动 |
| plan | 写 Plan/AC/Validation | 改 src/tests |
| proposal_review | 调 Task readonly：`proposal-review-subagent` skill | 改 src/tests |
| execute | 按 Plan 实现；用 `commit` skill | 跳过 verify 自证 |
| verify | 调 Task readonly：`qa-verify-subagent` skill | 主 agent 自己跑测试 |
| archive | Workpad 摘要、风险 | 无 V1 pass 不得进 submit |
| submit | `commit` + `push` skill | 无 V1 pass 不得 push |
| handoff | 不改代码 | — |

## C0 硬门禁

Clarification 未全勾选或存在高影响 unknown 时：**禁止**进入 plan/execute，**禁止**修改 `src/`、`tests/`。

不可推断时：Notes 写 `[CLARIFY] …`，Phase→`blocked`，**正常结束 turn**。

## Subagent 硬门禁

- 无 `REVIEW_REPORT: PASS` 不得 Phase→`execute`（来自 proposal_review）
- 无 `VERIFICATION_REPORT: PASS` 不得 Phase→`archive` 或 `submit`

## 验证失败

默认 `VERIFICATION_REPORT: FAIL` → Phase=`execute`（不回 clarify）。仅 Plan/AC 错误时 → `plan` 或 `proposal_review`。

## 1:1

Workpad `ChangeRef` 只绑定本 issue；scope 膨胀记 Notes follow-up，不扩 Plan。

## Skills

- `.agents/skills/commit/SKILL.md`
- `.agents/skills/push/SKILL.md`
- `.agents/skills/proposal-review-subagent/SKILL.md`
- `.agents/skills/qa-verify-subagent/SKILL.md`

完整说明：`docs/symphony-agent-workflow.md`
