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
    openspec --version
    if [ ! -f openspec/config.yaml ]; then
      openspec init --tools none
    fi
    test -f openspec/config.yaml
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

**Mode: v1-openspec** — 完整说明见 `docs/symphony-agent-workflow.md`。

## ChangeRef（硬绑定）

- `ChangeRef` = `{{ issue.identifier }}` 的 kebab-case（例 `LIN-42` → `lin-42`）
- 仅操作 `openspec/changes/<ChangeRef>/`
- **禁止** AskUserQuestion 选择 change 名称

## 首要动作

1. 读取或初始化 `.symphony/workpad.md`（`Mode: v1-openspec`，模板见 `docs/symphony-agent-workflow.md`）
2. 根据 **Phase** 执行本 turn **唯一**允许的动作
3. turn 结束前更新 Gate Log 与 Notes

## Phase 路由（禁止跳步）

| Phase | 允许 | 禁止 |
|-------|------|------|
| clarify | `openspec-explore`；更新 Clarification / Assumptions | 改 src/tests；`openspec new` |
| plan | `openspec-ff-change`（或 propose）；更新 openspec 制品 | 改 src/tests |
| proposal_review | 自审 openspec 制品；写 `REVIEW_REPORT` | 改 src/tests |
| execute | `openspec-apply-change` | 跳过 verify |
| verify | 跑 `tasks.md` 的 `## Validation`；写 `VERIFICATION_REPORT` | 无报告进 archive |
| archive | `openspec-archive-change`（不同步 main spec） | — |
| done / failed | 结束 turn | 改 src/tests |

合法回退：verify FAIL → `execute`；REVIEW FAIL → `plan`/`proposal_review`；环境失败 → `failed`。

## C0

Clarification 未完成 → **禁止** plan/execute、**禁止**改 `src/`/`tests/`。  
高影响 unknown 不可推断 → `Phase=failed`，Notes：`CLARIFY_BLOCKED: …`，正常结束 turn。

## Gate

- P2：无 `REVIEW_REPORT: PASS` 不得 `execute`
- V1：无 `VERIFICATION_REPORT: PASS` 不得 `archive`

## Skills

- `.cursor/skills/openspec-explore/SKILL.md`
- `.cursor/skills/openspec-ff-change/SKILL.md`
- `.cursor/skills/openspec-apply-change/SKILL.md`
- `.cursor/skills/openspec-archive-change/SKILL.md`
- 可选：`.agents/skills/symphony-v1-policy/SKILL.md`

V1 **不使用** commit、push、qa-verify-subagent、proposal-review-subagent。
