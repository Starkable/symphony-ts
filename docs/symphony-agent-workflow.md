# Cursor Agent Policy 工作流

本文档定义 symphony-ts **Policy 层**无人值守工作流：澄清 → 计划 → 评审 → 执行 → Subagent 验证 → 归档 → 提 PR。

编排器（orchestrator）只负责 dispatch 与 workspace；**阶段推进、门禁与验证**由 `WORKFLOW.md` prompt、`.symphony/workpad.md` 与 `.agents/skills/` 约定。

## 前置依赖

- **Cursor CLI harness** 可用（建议先合并或收尾 OpenSpec change `fix-cursor-cli-harness`）
- 目标仓库根目录或 workspace 内可写 `.symphony/workpad.md`
- 启动 Symphony 前导出 `GH_TOKEN` / `GITHUB_TOKEN`（若需 push/PR）

## 架构概览

```
WORKFLOW.md（Phase 路由 + 硬规则）
        │
        ▼
.symphony/workpad.md（流程真相源）
        │
   ┌────┴────┐
   ▼         ▼
主 Agent   Subagent（readonly）
clarify…   Proposal Reviewer（建议）
execute    QA Verifier（必须）
```

- **不强制** OpenSpec propose/apply/archive；Plan/AC/Validation 写在 Workpad 即可
- **1 需求 : 1 ChangeRef**，避免 scope 膨胀

## 阶段状态机

```
clarify ──C0──► plan ──► proposal_review ──► execute ──► verify ──► archive ──► submit ──► handoff
   │              ▲              │                         │
   │ blocked      │              │ 改 Plan/AC              │ V1 fail（默认）
   └──────────────┘              └─────────────────────────┴──► execute
```

| Phase | 主 Agent 能否改产品代码 | 说明 |
|-------|------------------------|------|
| `clarify` | **否** | 只澄清需求、更新 Workpad |
| `blocked` | **否** | 等信息；无新回复则立即结束 turn |
| `plan` | **否** | 只写 Plan / AC / Validation |
| `proposal_review` | **否** | Subagent 评审 Plan |
| `execute` | **是** | 按 Plan 实现 |
| `verify` | **否** | 等 QA Subagent 报告 |
| `archive` | 文档为主 | 摘要、风险 |
| `submit` | PR 相关 | push、开 PR |
| `handoff` | **否** | 等人审 |

## C0 澄清硬门禁

在 `Clarification` checklist **未全部勾选**或存在**未解决的高影响 unknown** 时：

- **禁止**修改 `src/`、`tests/` 及应用实现性配置
- **禁止**进入 `execute`
- **禁止**创建实现性 commit
- **允许**读代码、更新 Workpad、写 `[CLARIFY]`、设 `Phase=blocked`

**规则：未澄清，不动手。**

### 推断与 Assumptions

- 低影响歧义：按项目 convention 推断，写入 `### Assumptions`
- 高影响歧义（API 契约、安全、破坏性变更、数据迁移）：**禁止**静默推断 → `blocked` + `[CLARIFY]`

### blocked 暂挂

1. Notes 写入 `[CLARIFY] <问题>`
2. `Phase` → `blocked`
3. **正常结束 turn**（不要 abnormal exit）
4. 人工在 Notes 回答后，将 `Phase` 改回 `clarify`

## Gate 定义

| Gate | 阶段 | 通过条件 |
|------|------|----------|
| **C0** | clarify → plan | Clarification 全勾选；无 open 高影响 unknown |
| **P1** | plan → proposal_review | Plan、AC、Validation 草案完整 |
| **P2** | proposal_review → execute | `REVIEW_REPORT: PASS` 或 gap 已修复 |
| **V1** | verify → archive | `VERIFICATION_REPORT: PASS`（**必须** Subagent） |
| **S1** | submit → handoff | PR 已创建/更新，Validation 证据在 Workpad |

## 验证失败路由

| 情况 | 下一 Phase |
|------|------------|
| 测试/AC 未满足，Plan 仍正确 | **`execute`**（默认） |
| Plan/AC 与需求不一致 | `plan` 或 `proposal_review`（**不回** clarify） |
| 环境/凭证/依赖缺失 | `blocked` |
| 需求理解根本错误 | `clarify` + Notes 记 `REOPEN_CLARIFY`（建议人工确认） |

## Subagent 规则

### Proposal Reviewer（建议）

- **阶段**：`proposal_review`
- **Skill**：`.agents/skills/proposal-review-subagent/SKILL.md`
- **readonly**：是
- **输出**：`REVIEW_REPORT: PASS` 或 `REVIEW_REPORT: FAIL` + gap 列表

### QA Verifier（必须）

- **阶段**：`verify`
- **Skill**：`.agents/skills/qa-verify-subagent/SKILL.md`
- **readonly**：是
- **硬门禁**：主 Agent **不得**在无 `VERIFICATION_REPORT: PASS` 时设 `Phase=archive` 或 `submit`

### Cursor Task 首选路径

WORKFLOW prompt 要求 verify / proposal_review 阶段使用 Task 工具：

```
Task(subagent_type: generalPurpose, readonly: true, prompt: «按 qa-verify-subagent skill…»)
```

### 降级方案（CLI 无 Task 时）

1. 主 Agent 在 verify 阶段**不得**自行跑测试
2. 写入 `.symphony/verify-request.md`（AC、Validation 命令、git diff 摘要）
3. **下一 turn** 以只读 verifier 身份启动（WORKFLOW 声明独立 prompt 角色），产出 `VERIFICATION_REPORT`
4. 主 Agent 读取报告后再改 Phase

proposal_review 同理，可使用 `.symphony/review-request.md`。

## Skills 与 Phase 索引

| Phase | Skills |
|-------|--------|
| clarify / blocked | （无强制 skill） |
| plan | — |
| proposal_review | `proposal-review-subagent` |
| execute | `commit` |
| verify | `qa-verify-subagent` |
| archive | — |
| submit | `commit`, `push` |
| handoff | — |

Skills 位于仓库 `.agents/skills/`（可从 symphony-ts 复制）。

## Workpad 模板

路径：**`.symphony/workpad.md`**（建议不提交 git，或团队自行决定）。

```markdown
## Agent Workpad

### Meta
- Phase: clarify
- ChangeRef: REQ-001
- Branch: task/REQ-001-short-slug

### Clarification
- [ ] 目标与非目标已写清
- [ ] 无未解决的高影响 unknown
- [ ] AC 草案已列出

### Plan
- Why:
- What:
- Non-goals:
- [ ] 1. …
  - [ ] 1.1 …

### Acceptance Criteria
- [ ] …

### Validation
- [ ] `pnpm test`
- [ ] `pnpm lint`

### Assumptions
- （推断时必填：假设 + 证据）

### Gate Log
- C0: pending @ —
- P2: pending @ —
- V1: pending @ —

### Notes
- YYYY-MM-DD HH:MMZ: …
```

每通过一个 Gate，更新 `Gate Log`（pass/fail + ISO 时间戳）。

## 与 orchestrator 的边界

- issue 仍在 `active_states` 时，worker 正常退出后会 **约 1s continuation retry**
- `blocked` 阶段：WORKFLOW 要求**零代码改动、立即结束 turn**，降低空转成本
- 彻底停止 dispatch 需将 issue 移出 `active_states` 或后续 execution 层门控（见 TODO）

## 试跑检查清单

启用 Policy 工作流前：

- [ ] `fix-cursor-cli-harness` 已合并或本地可用
- [ ] `WORKFLOW.md` 中 `agent.harness: cursor`、`mode: force`
- [ ] `hooks.after_create` 能 clone/install 目标仓库
- [ ] `.agents/skills/` 已复制到目标仓库
- [ ] 试跑 ticket：模糊描述 → agent 进入 `blocked`，且未改 `src/`
- [ ] 试跑 ticket：清晰描述 → clarify → plan → … → `VERIFICATION_REPORT: PASS` → PR

### 文案走查（5.1 / 5.2）

**模糊需求**：WORKFLOW 含 C0、`[CLARIFY]`、`Phase=blocked`、禁止改 `src/` → 应导向 blocked。

**Happy path**：prompt 覆盖 `clarify → plan → proposal_review → execute → verify → archive → submit → handoff`，且 verify 引用 `qa-verify-subagent`，无 Phase 缺口。

## 参考文件

- 字段注释模板：[WORKFLOW.template.md](./WORKFLOW.template.md)
- 可运行样例：[examples/workflow-cursor-policy/WORKFLOW.md](../examples/workflow-cursor-policy/WORKFLOW.md)
- Cursor harness：[agent-harness.md](./agent-harness.md)

## 暂缓 TODO

以下能力**不在**本 Policy 包内实现，后续迭代：

| 项 | 说明 |
|----|------|
| 需求平台 adapter | 替代 Linear；评论、`[CLARIFY]`、状态 Review/Handoff 同步 |
| orchestrator dispatch 门控 | 读 `.symphony/execution-state.json`，paused 时不 spawn |
| `[MISSING_INFO]` harness 解析 | 结构化 turn outcome |
| clarification 超时 sweeper | 自动 reset workspace + 超时评论 |
| OpenSpec 可选绑定 | 大改时将 Workpad Plan 同步为 `openspec/changes/<name>/` |
| Human Review 自动 poll | 扩 `active_states` + handoff prompt |
| Codex Policy 对等 | 与 Cursor 相同的 Workpad 流程 |
