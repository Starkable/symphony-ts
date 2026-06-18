---
# ============================================================
# tracker — Issue tracker connection ("linear" or "pms")
# ============================================================
tracker:
  # Tracker backend. Supported: linear, pms
  kind: linear

  # GraphQL endpoint for the Linear API.
  # Default: https://api.linear.app/graphql
  endpoint: https://api.linear.app/graphql

  # Linear API key. Use $ENV_VAR syntax to read from environment,
  # or set the LINEAR_API_KEY environment variable directly.
  # Required for dispatch.
  api_key: $LINEAR_API_KEY

  # Linear project slug (the short identifier visible in issue URLs).
  # Required for dispatch. Example: ENG, MYPROJECT-abc123
  project_slug: YOUR_PROJECT_SLUG

  # Issue states that are eligible for the agent to pick up.
  # Default: [Todo, In Progress]
  active_states: [Todo, In Progress]

  # Issue states that are considered permanently finished.
  # Reaching one of these triggers workspace cleanup.
  # Default: [Closed, Cancelled, Canceled, Duplicate, Done]
  terminal_states: [Closed, Cancelled, Canceled, Duplicate, Done]

# --- PMS (Jira) read-only tracker example ---
# Uncomment and replace the linear tracker block above when using PMS.
# Setup & smoke tests: docs/pms-tracker.md
# Field mapping (WORKFLOW / Jira / Issue): docs/pms-field-mapping.md
#
# tracker:
#   kind: pms
#   endpoint: http://pms.qiyi.domain
#   project_slug: CS
#   active_states: [Open, "In Progress"]
#   terminal_states: [Done, Closed]
#   issue_types: [产品需求]
#   exclude_draft_status: true
#   oauth:
#     access_token: $PMS_OAUTH_ACCESS_TOKEN
#     access_token_secret: $PMS_OAUTH_ACCESS_TOKEN_SECRET
#     rsa_private_key_path: $PMS_JIRA_KEY_PATH
#     consumer_key: qa-monitor
#     validate_on_dispatch: true

# ============================================================
# polling — How often Symphony checks for new/changed issues
# ============================================================
polling:
  # Interval between poll ticks in milliseconds.
  # Default: 30000 (30 s)
  interval_ms: 30000

# ============================================================
# workspace — Per-issue working directory management
# ============================================================
workspace:
  # Root directory under which per-issue workspaces are created.
  # Supports ~ expansion, relative paths (resolved from WORKFLOW.md),
  # and $ENV_VAR references.
  # Default: <os.tmpdir()>/symphony_workspaces
  root: /tmp/symphony_workspaces

# ============================================================
# hooks — Shell commands run at workspace lifecycle events
# All hooks are optional (omit or set to null/empty to skip).
# ============================================================
hooks:
  # Run after a new workspace directory is created.
  after_create: null

  # Run before each agent turn starts (fatal on non-zero exit).
  before_run: null

  # Run after each agent turn finishes (best-effort, errors suppressed).
  after_run: null

  # Run before a workspace is removed (best-effort, errors suppressed).
  before_remove: null

  # Maximum time in ms any single hook may run before being killed.
  # Default: 60000 (60 s)
  timeout_ms: 60000

# ============================================================
# agent — Concurrency and retry behaviour
# ============================================================
agent:
  # Agent runtime backend: codex (default) or cursor.
  # Default: codex
  harness: codex

  # Maximum number of issues being processed simultaneously.
  # Default: 10
  max_concurrent_agents: 10

  # Maximum number of Codex turns allowed per run attempt.
  # Default: 20
  max_turns: 20

  # Maximum retry back-off delay in milliseconds (exponential back-off cap).
  # Default: 300000 (5 min)
  max_retry_backoff_ms: 300000

  # Per-state concurrency limits (optional, overrides max_concurrent_agents
  # for issues in a specific state). Example:
  #   max_concurrent_agents_by_state:
  #     In Review: 2
  # Default: {} (no per-state limits)
  max_concurrent_agents_by_state: {}

# ============================================================
# harnesses — Per-backend runtime configuration
# ============================================================
harnesses:
  codex:
    # Shell command used to launch the Codex app-server.
    # Default: codex app-server
    command: codex app-server

    approval_policy: never
    thread_sandbox: null
    turn_sandbox_policy: null
    turn_timeout_ms: 3600000
    read_timeout_ms: 5000
    stall_timeout_ms: 300000

  cursor:
    # Cursor Agent CLI (`agent`). Use an absolute path in production if PATH is limited.
    # Default: agent
    command: agent

    # Unattended Symphony requires force mode (maps to CLI --force).
    mode: force

    # Optional model id from `agent models` (not the display name).
    model: null

    # Experimental; passed as --sandbox when set.
    sandbox: null

    # Session reuse across workers for the same issue.
    # Values: per_issue | fresh_each_run
    reuse_policy: per_issue

    # Per-turn subprocess timeout in milliseconds.
    turn_timeout_ms: 3600000

    # Per-turn structured logging (cursor_turn_start / cursor_turn_finished).
    # Default: true
    turn_log_enabled: true

    # Max UTF-8 bytes per stdout/stderr/thinking field in symphony.jsonl.
    # Default: 32768
    turn_log_max_bytes: 32768

    # Include full prompt after `--` in structured logs (sensitive; default false).
    turn_log_include_prompt: false

    # Write full CLI output to <workspace>/.symphony/cursor-turn-N.log (UTF-8).
    # Default: true
    turn_log_workspace_artifact: true

# ============================================================
# codex — Legacy Codex block (alias for harnesses.codex)
# ============================================================
codex:
  # Shell command used to launch the Codex app-server.
  # Add `--config shell_environment_policy.inherit=all` if agent turns
  # should inherit environment variables from the launching shell.
  # Default: codex app-server
  command: codex app-server

  # Codex approval policy, passed through to the app-server.
  # Common values depend on the installed Codex schema.
  # Example values: never, on-request, on-failure
  # Default: (not set — inherits Codex default)
  approval_policy: never

  # Thread-level sandbox mode passed through to Codex.
  # Example values: workspace-write
  # Default: (not set)
  thread_sandbox: null

  # Per-turn sandbox policy passed through to Codex.
  # Example:
  #   turn_sandbox_policy:
  #     type: workspaceWrite
  #     writableRoots:
  #       - /tmp/symphony_workspaces
  #     readOnlyAccess:
  #       type: fullAccess
  #     networkAccess: true
  #     excludeTmpdirEnvVar: false
  #     excludeSlashTmp: false
  # Default: (not set)
  turn_sandbox_policy: null

  # Maximum wall-clock time in ms for a full agent turn.
  # Default: 3600000 (1 h)
  turn_timeout_ms: 3600000

  # Maximum time in ms to wait for the next event from Codex before
  # considering the stream stalled.
  # Default: 5000 (5 s)
  read_timeout_ms: 5000

  # Maximum time in ms a running agent may be silent before being
  # declared stalled and stopped.
  # Default: 300000 (5 min)
  stall_timeout_ms: 300000

# ============================================================
# server — Built-in HTTP status server (optional)
# ============================================================
server:
  # Port to listen on. Set to a number to enable, or omit/null to disable.
  # Default: null (disabled)
  port: null

# ============================================================
# observability — Live dashboard refresh behavior (optional)
# ============================================================
observability:
  # Enable live updates for the HTTP dashboard.
  # Default: true
  dashboard_enabled: true

  # Heartbeat interval in milliseconds for live dashboard refreshes.
  # Used to keep runtime counters current even when no orchestration state changes.
  # Default: 1000 (1 s)
  refresh_ms: 1000

  # Minimum spacing between pushed dashboard renders in milliseconds.
  # Default: 16 (~60 FPS upper bound)
  render_interval_ms: 16
---

You are implementing work for Linear issue {{ issue.identifier }}.

<!-- Replace the lines below with your actual agent instructions. -->

Rules:

1. Implement only what the ticket asks for.
2. Keep changes scoped and safe.
3. Run the test suite before finishing.
4. Do not add secrets or credentials to the repository.

If this workflow needs environment variables from the launching shell:

1. Launch Codex with `--config shell_environment_policy.inherit=all`.
2. Export the required environment variables before launching Symphony.

If the agent must call networked tools during a turn:

1. Configure `codex.turn_sandbox_policy` with explicit `networkAccess: true`.
2. If a specific CLI still does not find usable credentials in your environment, provide that
   tool's credential via an env var such as `GH_TOKEN`, `GITHUB_TOKEN`, or a provider-specific API
   key.

When finished:

1. Update the Linear issue state to "Done" using the `linear_graphql` tool.
   First, query the available workflow states to find the "Done" state ID:
   ```graphql
   query GetWorkflowStates {
     workflowStates {
       nodes { id name }
     }
   }
   ```
   Then update the issue:
   ```graphql
   mutation CompleteIssue($id: String!, $stateId: String!) {
     issueUpdate(id: $id, input: { stateId: $stateId }) {
       success
     }
   }
   ```

2. Provide a summary:
   - What changed
   - Test command and result
   - Any follow-up risks

---

# Cursor Policy V1（OpenSpec 默认，推荐 prompt 段）

当 `agent.harness: cursor` 且需 **V1 全自动 Policy**（OpenSpec 默认实现、无 Git/Subagent）时，使用下方块或直接使用样例：

- Linear：[examples/workflow-cursor-policy/WORKFLOW.md](../examples/workflow-cursor-policy/WORKFLOW.md)
- PMS：[examples/workflow-pms-openspec/WORKFLOW.md](../examples/workflow-pms-openspec/WORKFLOW.md)

完整说明：[symphony-agent-workflow.md](./symphony-agent-workflow.md)（V1 默认 + V2 增强分节）。

### 宿主机准备（openspec CLI，人工一次）

在部署 Symphony 的机器上安装并验证 `openspec`（**不要**在 `after_create` 里 `npm install -g`）：

```bash
openspec --version
```

### hooks.after_create：OpenSpec 初始化（每个 workspace）

clone 与 `pnpm install` 之后执行。完整片段见 [snippets/openspec-workspace-bootstrap.sh](./snippets/openspec-workspace-bootstrap.sh)。

```yaml
hooks:
  after_create: |
    git clone --depth 1 'https://github.com/your-org/your-repo.git' .
    pnpm install
    openspec --version
    if [ ! -f openspec/config.yaml ]; then
      openspec init --tools none
    fi
    test -f openspec/config.yaml
```

可选：设置 `SYMPHONY_POLICY_ROOT` 指向 symphony-ts 根目录，在 bootstrap 脚本中复制 skills。

若宿主机未装 CLI 或 init 失败 → hook 退出非 0；agent 应记 `Phase=failed`。

### openspec tasks.md Validation 约定

每个 `openspec/changes/<ChangeRef>/tasks.md` 末尾应包含：

```markdown
## Validation

- [ ] `pnpm test`
- [ ] `pnpm lint`
```

verify Phase 以该段为命令权威来源。

### V1 prompt 摘要（可嵌入 WORKFLOW body）

```markdown
Mode: v1-openspec
ChangeRef = kebab-case({{ issue.identifier }})；仅 openspec/changes/<ChangeRef>/；禁止 AskUserQuestion 选 change。

Phase（禁止跳步）：clarify→plan→proposal_review→execute→verify→archive→done
- clarify: openspec-explore
- plan: openspec-ff-change
- proposal_review: 自审 → REVIEW_REPORT
- execute: openspec-apply-change
- verify: tasks.md ## Validation → VERIFICATION_REPORT
- archive: openspec-archive-change（不同步 main spec）

C0 未过禁止改 src/tests；不可推断 → failed + CLARIFY_BLOCKED（不 blocked 等人）。

Skills: .cursor/skills/openspec-{explore,ff-change,apply-change,archive-change}
可选: .agents/skills/symphony-v1-policy/SKILL.md
```

---

# Cursor Policy V2（Subagent + Git，可选 prompt 段）

V2 在 V1 上增加 Subagent 验证、`blocked` 等人、`submit`/push。prompt 要点：

- proposal_review：`proposal-review-subagent`（Task readonly）
- verify：`qa-verify-subagent`（主 agent 不得自证）
- submit：`commit` + `push` skills

Skills：`.agents/skills/{commit,push,proposal-review-subagent,qa-verify-subagent}/SKILL.md`

详见 [symphony-agent-workflow.md](./symphony-agent-workflow.md#v2-模式subagent--git--人审)。
