# Cursor Agent Policy 工作流

本文档定义 symphony-ts **Policy 层**编排契约。

**V1.2（推荐）**：产物为唯一进度真相、`WORKFLOW.md` 唯一配置、无 workpad — 见 [V1.2 产物驱动模式](#v12-产物驱动模式)。  
**V1.1（legacy）**：workpad Phase/Gate + `.symphony/workflow/phases/` 中文报告 — 见 [V1 OpenSpec 默认模式](#v1-openspec-默认模式)。  
**增强（V2）**：Subagent 验证、blocked 等人、commit/push/handoff — 见 [V2 模式](#v2-模式subagent--git--人审)。

---

## V1.2 产物驱动模式

> **BREAKING** 相对 V1.1：废弃 workpad `Phase`/Gate Log 与 `.symphony/workflow/phases/*/评审报告.md`；进度由 `openspec/changes/{change_ref}/` 下六文件推导。

### 架构

```
WORKFLOW.md（workflow.phases 短表 + 薄 prompt 正文）
        │
        ▼
Symphony 扫描产物 → deriveEffectivePhase → 每 turn 注入 handler + produces
        │
        ▼
openspec/changes/{change_ref}/（六产物，英文文件名）
        │
        ▼
.cursor/skills/openspec-*（clarify / review / plan / apply / verify / archive）
```

### 配置（仅 WORKFLOW front matter）

```yaml
workflow:
  version: "1.2"
  change_ref: kebab_case_issue_id
  phases:
    - id: clarify
      handler: openspec-new-change
      produces: openspec/changes/{change_ref}/proposal.md
    - id: proposal_review
      handler: openspec-proposal-review
      produces: openspec/changes/{change_ref}/proposal_review.md
      requires_pass: true
    - id: plan
      handler: openspec-continue-change
      produces: openspec/changes/{change_ref}/tasks.md
    - id: execute
      handler: openspec-apply-change
      produces: openspec/changes/{change_ref}/execute.md
      requires_pass: true
    - id: verify
      handler: openspec-verify
      produces: openspec/changes/{change_ref}/verification.md
      requires_pass: true
    - id: archive
      handler: openspec-archive-change
      produces: openspec/changes/{change_ref}/archive.md
      requires_pass: true
```

- `change_ref` = `kebab-case(issue.identifier)`，Symphony 展开 `{change_ref}` 占位符
- 无 `workflow` 段时保持 **legacy prompt-only**（与旧 WORKFLOW 兼容）

### 六产物契约

| Phase | 产物路径 | 完成条件 |
|-------|----------|----------|
| clarify | `proposal.md` | 文件存在 |
| proposal_review | `proposal_review.md` | `status: pass` front matter |
| plan | `tasks.md` | 文件存在 |
| execute | `execute.md` | `status: pass` |
| verify | `verification.md` | `status: pass` |
| archive | `archive.md` | `status: pass`（active 或 `archive/YYYY-MM-DD-{ref}/` 下均可） |

### 阶段推导算法

```
for phase in workflow.phases（有序）:
  if phase.produces 未完成 → effective_phase = phase.id; break
若全部完成 → done
```

`requires_pass: false`：文件存在即完成。`requires_pass: true`：文件存在且 front matter `status: pass`。

### Symphony Prompt 注入（每 turn，含续跑）

WORKFLOW Markdown 正文保持**薄**（角色、ChangeRef 规则、不提交远程等）。Symphony 追加：

- `effective_phase`
- `/{handler}`
- 展开后的 `produces` 路径

### 与 orchestrator 的边界

- issue 在 `active_states` 时 worker 正常退出后约 1s continuation retry
- V1.2 不依赖 workpad；Dashboard `current_phase` 由产物推导
- `artifact_store` 启用时 exporter 无 workpad 也不失败

### symphony-openspec-bundle 协调

独立仓需同步六产物路径与 skill 写文件约定，见 [symphony-workflow-v1-2-bundle-coordination.md](./symphony-workflow-v1-2-bundle-coordination.md)。

---

## 前置依赖（V1 / V1.2 共用）

### 宿主机人工准备（安装一次）

在运行 Symphony 的机器上由操作者完成，**不要**写在 `hooks.after_create` 里：

- **Cursor CLI** `agent` 在 PATH 中
- **symphony-ts** 已构建或全局安装
- **`openspec` CLI** 已安装且 `openspec --version` 成功
- Tracker 凭据（Linear / PMS 环境变量）

目标业务 git 仓库**默认不含** `openspec/` 与 Policy skills；不要假设 clone 即可用 OpenSpec。

### Workspace：`after_create` 初始化（每个 issue workspace）

每个新 workspace 在 **clone 与业务依赖安装之后**，由 `hooks.after_create` 完成 **OpenSpec 仓库级初始化**：

1. `openspec --version`（校验宿主机已装 CLI，**不**执行 install）
2. 若不存在 `openspec/config.yaml` → `openspec init --tools none`
3. 设置 `SYMPHONY_POLICY_ROOT` 指向 **symphony-openspec-bundle** 独立仓库根目录；`after_create` 调用 `bootstrap/install.sh`
4. 自检：`test -f openspec/config.yaml`（失败则 hook 非 0 退出）

可复用片段：[docs/snippets/openspec-workspace-bootstrap.sh](./snippets/openspec-workspace-bootstrap.sh)

若目标仓**已提交** `openspec/`，clone 后跳过 init 即可。

### 其他

- 目标 workspace 可写 `.symphony/workpad.md`
- 业务 runtime skills **仅**来自独立仓 `symphony-openspec-bundle`（见 `examples/symphony-openspec-bundle/README.md`）

V1 **不需要** `GH_TOKEN` / `GITHUB_TOKEN`（无 push/PR）。
---

## V1 OpenSpec 默认模式

> **Legacy V1.1**：以下 workpad/Gate 模型已被 [V1.2](#v12-产物驱动模式) 取代；新项目请使用 `workflow.phases` 短表。

### 架构

```
WORKFLOW.md（Phase 路由 + Gate + ChangeRef 绑定）
        │
        ▼
.symphony/workpad.md（流程态：Phase / Gate Log / Notes）
        │
        ▼
openspec/changes/<ChangeRef>/（制品真相源：proposal / specs / design / tasks）
        │
        ▼
.cursor/skills/openspec-*（clarify / plan / apply / archive）
```

- **Policy** 管「何时、能否写代码、Gate 是否通过」
- **OpenSpec** 管 Plan/AC/Tasks/Validation 制品与 apply/archive
- **1 需求 : 1 ChangeRef** = `kebab-case(issue.identifier)` → `openspec/changes/<ChangeRef>/`

### 状态机（V1.1，**BREAKING** 相对 V1）

> V1.1 采用**方案 B**。定制化 OpenSpec 见独立仓库 **`symphony-openspec-bundle`**（与 symphony-ts 同级 clone）。

```
clarify ──C0──► proposal_review ──P2──► plan ──P1──► execute ──► verify ──V1──► archive ──► done
   │              │                      │              │              │
   │              │                      │              │              │ fail
   └─ failed*     └─ FAIL → clarify/plan └──────────────┤              └──► execute
                                                         │
* 高影响 unknown 无法推断 → Phase=failed，Notes：CLARIFY_BLOCKED（不等人）
```

| Phase | 默认 Skill / 动作 | 改 `src/`？ | 说明 |
|-------|-------------------|-------------|------|
| `clarify` | explore + 写 `proposal.md` | **否** | C0 澄清，产出需求提案 |
| `proposal_review` | 策略包 `symphony-提案评审` | **否** | 输出 `评审报告.md` + `REVIEW_REPORT` |
| `plan` | `openspec-continue-change` 至 tasks | **否** | **不用**默认 ff-change |
| `execute` | `openspec-apply-change` | **是** | 按 tasks 实现 |
| `verify` | 主 agent 跑 `tasks.md` 的 `## Validation` | **否** | 输出 `VERIFICATION_REPORT` |
| `archive` | `openspec-archive-change` + 归档说明 | 文档 | |
| `done` | — | **否** | 本 issue run 结束 |
| `failed` | — | **否** | 澄清/环境失败，正常结束 turn |

**禁止跳步**：除下表合法回退外，不得省略 Phase（尤其不得跳过 `proposal_review` 或 `verify`）。

| 情况 | 下一 Phase |
|------|------------|
| 测试/实现未满足，openspec 计划仍正确 | `execute` |
| Plan/spec 与需求不一致 | `plan` 或 `proposal_review` |
| 环境缺 openspec CLI 等 | `failed` + Notes |
| 需求理解根本错误 | `clarify` + Notes `REOPEN_CLARIFY` |

### Gate（V1.1）

| Gate | 过渡 | 通过条件 |
|------|------|----------|
| **C0** | clarify → proposal_review | `proposal.md` 存在且可审 |
| **P2** | proposal_review → plan | Notes 含 `REVIEW_REPORT: PASS` |
| **P1** | plan → execute | `openspec status` 显示 tasks apply-ready |
| **V1** | verify → archive | Notes 含 `VERIFICATION_REPORT: PASS` + Validation 命令 exit 0 |

### C0 澄清（V1）

- **禁止**（C0 未过）：改 `src/`、`tests/`、`openspec new change`、`openspec-apply`
- **允许**：读代码、`openspec-explore`、更新 workpad、写 Assumptions 到 openspec proposal / Notes
- 低影响歧义 → `Assumptions`（含证据）
- 高影响且不可推断 → `Phase=failed`，Notes：`CLARIFY_BLOCKED: <原因>`，**正常结束 turn**（V1 不使用 `blocked` 等人）

### ChangeRef 与无人值守

- `ChangeRef` = `issue.identifier` 的 kebab-case（例：`BCS-1234` → `bcs-1234`）
- **禁止** `AskUserQuestion` 选择 change；仅操作 `openspec/changes/<ChangeRef>/`
- 每 turn **先读** workpad `Phase`，再执行该 Phase 唯一允许动作

### proposal_review（V1.1）

读 `openspec/changes/<ChangeRef>/proposal.md`，写入 `.symphony/workflow/phases/proposal_review/评审报告.md`，Notes 输出：

```
REVIEW_REPORT: PASS
```

或 `REVIEW_REPORT: FAIL` + `Gaps:` 列表。FAIL 时 Phase 保持 `proposal_review` 或回 `clarify`/`plan`。

### verify（V1 主 agent 单路径）

执行 `openspec/changes/<ChangeRef>/tasks.md` **末尾** `## Validation` 中的命令（例：`pnpm test`、`pnpm lint`），Notes 输出：

```
VERIFICATION_REPORT: PASS
Checks:
- pnpm test: exit 0
...
```

失败 → `VERIFICATION_REPORT: FAIL` → Phase=`execute`。

### tasks.md Validation 约定

每个 change 的 `tasks.md` **必须**包含末尾章节：

```markdown
## Validation

- [ ] `pnpm test`
- [ ] `pnpm lint`
```

（按目标仓库替换命令。）

### Workpad 模板（V1 瘦身）

路径：`.symphony/workpad.md`（建议不提交 git）。

```markdown
## Agent Workpad

### Meta
- Phase: clarify
- ChangeRef: bcs-1234
- Mode: v1-openspec

### Clarification
- [ ] 目标与非目标已写清
- [ ] 无未解决的高影响 unknown（或已记入 openspec / Assumptions）
- [ ] 验收方向已明确（细节在 openspec specs）

### Gate Log
- C0: pending @ —
- P1: pending @ —
- P2: pending @ —
- V1: pending @ —

### Notes
- YYYY-MM-DDTHH:MMZ: …
```

**不在 workpad 重复** Plan / AC / Validation 正文（权威在 openspec 制品）。

### Skills 索引（V1.1）

安装后全部位于 workspace `.cursor/skills/`（由 `symphony-openspec-bundle` 的 `bootstrap/install` 部署）：

| Phase | Skills |
|-------|--------|
| clarify | `symphony-clarify`、`openspec-explore`、`openspec-new-change` |
| proposal_review | `symphony-proposal-review` |
| plan | `symphony-plan`、`openspec-continue-change` |
| execute | `openspec-apply-change` |
| verify | `symphony-verify` |
| archive | `openspec-archive-change` |
| 横切 | `symphony-v1-policy` |

V1.1 **不使用** `.agents/skills`、commit、push、subagent skills。

### 试跑检查清单（V1）

- [ ] **宿主机**：`openspec --version`、`agent --version` 成功
- [ ] `fix-cursor-cli-harness` 已合并或本地可用
- [ ] `WORKFLOW.md`：`agent.harness: cursor`、`mode: force`
- [ ] `hooks.after_create`：clone + 业务 install + **OpenSpec init**（见 [snippets](./snippets/openspec-workspace-bootstrap.sh)）
- [ ] 首个 workspace 内存在 `openspec/config.yaml`
- [ ] 清晰 ticket：clarify → … → archive → **done**
- [ ] 模糊 ticket：`failed` + `CLARIFY_BLOCKED`，且未改 `src/`

### 可运行样例

- Linear：[examples/workflow-cursor-policy/WORKFLOW.md](../examples/workflow-cursor-policy/WORKFLOW.md)
- PMS：[examples/workflow-pms-openspec/WORKFLOW.md](../examples/workflow-pms-openspec/WORKFLOW.md)

---

## V2 模式（Subagent + Git + 人审）

V2 在 V1 之上增加：readonly Subagent 评审/验证、人工 `blocked`、`submit`/`handoff`、commit/push skills。

### 状态机（V2 扩展）

```
… → verify → archive → submit ──S1──► handoff
   │
clarify ⇄ blocked（等人回复 [CLARIFY]）
```

### Subagent 规则（V2）

| 角色 | 阶段 | Skill |
|------|------|-------|
| Proposal Reviewer | proposal_review | `.agents/skills/proposal-review-subagent/SKILL.md` |
| QA Verifier | verify | `.agents/skills/qa-verify-subagent/SKILL.md` |

- V2：**主 agent 不得**在无 Subagent `VERIFICATION_REPORT: PASS` 时进入 `archive`/`submit`
- Cursor Task：`Task(subagent_type: generalPurpose, readonly: true, …)`

### V2 Skills 索引

| Phase | Skills |
|-------|--------|
| execute | `commit` |
| verify | `qa-verify-subagent` |
| submit | `commit`, `push` |

### blocked（仅 V2）

1. Notes：`[CLARIFY] <问题>`
2. `Phase` → `blocked`
3. 正常结束 turn；人工回答后 Phase 改回 `clarify`

### Workpad 模板（V2 完整版）

在 V1 模板上可增加 `Plan` / `AC` / `Validation` 段（未绑 OpenSpec 时），或继续以 openspec 为权威仅扩 Phase（`submit`/`handoff`/`blocked`）。

---

## 与 orchestrator 的边界

- issue 仍在 `active_states` 时 worker 正常退出后 **约 1s continuation retry**
- V1 `failed` / V2 `blocked`：零代码改动、正常结束 turn
- 彻底停止 dispatch：将 issue 移出 `active_states` 或后续 execution 层门控（见 TODO）

## 参考文件

- 字段注释模板：[WORKFLOW.template.md](./WORKFLOW.template.md)
- Cursor harness：[agent-harness.md](./agent-harness.md)
- PMS 字段：[pms-field-mapping.md](./pms-field-mapping.md)

## 暂缓 TODO

| 项 | 说明 |
|----|------|
| **V2 Subagent 硬门禁** | readonly 评审/验证替代主 agent 自审自验 |
| **V2 Git/PR** | `commit`、`push` skills；`submit`/`handoff` Phase |
| **V2 blocked 等人** | 可选恢复 `[CLARIFY]` 人工唤醒 |
| **openspec sync-specs** | archive 时默认同步 main spec（V1 关闭） |
| orchestrator dispatch 门控 | 读 `.symphony/execution-state.json` |
| 需求平台写回 | PMS/Linear 评论与状态同步 |
| `[MISSING_INFO]` harness 解析 | 结构化 turn outcome |
| clarification 超时 sweeper | 自动 reset + 超时评论 |
| Codex Policy 对等 | 与 Cursor 相同 Policy 流程 |
