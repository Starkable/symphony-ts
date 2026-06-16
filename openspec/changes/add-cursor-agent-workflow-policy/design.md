## Context

symphony-ts 编排层（orchestrator + workspace + Cursor harness）已具备：按 issue dispatch、workspace 隔离、多 turn 续跑、`max_turns` 熔断。但 **agent 做什么、何时停、如何验证** 仍完全依赖仓库内 `WORKFLOW.md` prompt，缺少统一 Policy 约定。

讨论结论：

- 本变更仅建设 **Policy 层**（WORKFLOW、Workpad、skills、docs），不修改 orchestrator
- 暂不对接 Linear 或新需求平台；Workpad v1 使用 `.symphony/workpad.md`
- 默认 **不绑定 OpenSpec** 执行流；Workpad 的 Plan/AC/Validation 替代 proposal/specs/tasks
- Cursor CLI 为首选 harness；验证 **必须** readonly Subagent 出具报告

## Goals / Non-Goals

**Goals:**

- 提供可复制的 Cursor Policy 工作流：澄清 → 计划 → 评审 → 执行 → Subagent 验证 → 归档 → PR
- C0 硬门禁：未澄清禁止修改产品代码
- QA Verifier Subagent 硬门禁：无主 Agent 自证通过
- 验证失败默认回 `execute`；1 需求 : 1 ChangeRef
- 文档 + skills + WORKFLOW 模板，便于目标仓库直接启用

**Non-Goals:**

- 需求平台 API、评论同步、状态 mutation
- orchestrator dispatch 门控、execution-state.json、`[MISSING_INFO]` 解析
- clarification 超时 sweeper、Human Review 自动 poll
- 强制 OpenSpec propose/apply/archive 作为 agent 主路径
- Codex harness 的 Policy 对等（可后续 follow-up）

## Decisions

### D1：Workpad 为 Policy 真相源（非 OpenSpec）

- **选择**：`.symphony/workpad.md` 存储 Phase、Plan、AC、Validation、Assumptions、Gate Log
- **理由**：与 tracker 解耦；续跑不依赖平台评论
- **备选**：OpenSpec change 目录 — 留作可选增强，非默认

### D2：阶段状态机

```
clarify → plan → proposal_review → execute → verify → archive → submit → handoff
              ↑         │                              │
              └ blocked └──────────────────────────────┘ (仅改 Plan，不回 clarify)
verify 失败 ──────────────────────────────────────────→ execute（默认）
```

### D3：C0 澄清硬门禁

- **规则**：`Clarification` checklist 未全完成 **或** 存在未解决的高影响 unknown → 禁止进入 `plan`/`execute`，禁止修改 `src/`、`tests/`、开实现分支写代码
- **允许**：读代码、更新 Workpad、`[CLARIFY]` 写入 Notes、Phase→`blocked`

### D4：Subagent 分工

| 角色 | 阶段 | 必须？ | readonly |
|------|------|--------|----------|
| Proposal Reviewer | proposal_review | 建议 | true |
| QA Verifier | verify | **必须** | true |

- 主 Agent **不得**在无 `VERIFICATION_REPORT: PASS` 时设置 Phase=`archive`
- **实现**：WORKFLOW 指示使用 Cursor Task 工具（`readonly: true`）；若 CLI 不支持，Policy 文档记录降级方案（独立 verifier turn / `.symphony/verify-request.md`）

### D5：验证失败路由

- **默认**：`verify` 失败 → Phase=`execute`，在 Notes 记录 Subagent 报告
- **例外**：AC/Plan 本身错误 → `plan` 或 `proposal_review`（只改 Workpad，**不**回 `clarify`）
- **环境阻塞** → `blocked`
- **重新澄清**：仅 Workpad 记 `REOPEN_CLARIFY` 且建议人工确认

### D6：1:1 需求绑定

- Workpad `ChangeRef` 与单一 ticket/requirement 一对一
- scope 膨胀 → 新 ticket，不扩展当前 Plan

### D7：文档落点

- 完整流程与 TODO：`docs/symphony-agent-workflow.md`
- README：仅 Roadmap 短链（符合 README 不臃肿原则）

### D8：与 orchestrator 的边界

- `blocked` 阶段：prompt 要求无新信息则 **立即正常结束 turn**
- 已知限制：issue 仍在 `active_states` 时 orchestrator 会 continuation retry（约 1s）— v1 接受；后续可破边界加 dispatch 门控

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Cursor CLI 无 Task/Subagent | 文档写降级路径；P7 试跑验证；TODO 记录 |
| blocked 空转消耗 token | prompt 强制零改动 exit；`max_concurrent_agents_by_state` 可选限流 |
| 主 Agent 无视 Subagent 硬门禁 | WORKFLOW 用 MUST/SHALL；Gate Log 审计；后续 execution 层可解析报告 |
| Workpad 与 git 冲突 | Workpad 在 `.symphony/`；提交策略在 skill 中说明（通常不提交或单独 commit） |
| 无需求平台时「需求状态」不可更新 | handoff 仅写 Workpad Phase；平台对接列入 TODO |

## Migration Plan

1. 合并或收尾 `fix-cursor-cli-harness`
2. 按 tasks.md 顺序落地 docs → skills → WORKFLOW 模板 → 示例
3. 选一 stub ticket 在本地 workspace 试跑 P1–P6 路径
4. 目标仓库复制 `.agents/skills/` + 适配 WORKFLOW front matter

无 breaking API；纯 additive 文档与 skills。

## Open Questions

- Cursor CLI 稳定支持 Task subagent 的版本/标志（试跑后关闭）
- `.symphony/workpad.md` 是否纳入 git（建议：不提交，或 `.gitignore` 例外由团队定）
