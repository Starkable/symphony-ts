## Context

- **MVP 已完成**：`symphony-workflow-dashboard` 提供 Artifact Store、Exporter、三页 Dashboard；Phase 数组为 V1 顺序（`plan` 在 `proposal_review` 之前）
- **V1 Policy**（`docs/symphony-agent-workflow.md`）：`clarify → plan → proposal_review → execute → verify → archive`；plan 默认 `openspec-ff-change` 一次生成全套制品
- **团队决策（方案 B）**：`clarify → proposal_review → plan → execute → verify → archive`；OpenSpec 定制在 **外部策略包**，不改 `symphony-ts/openspec/`
- **现有注入点**：`SYMPHONY_POLICY_ROOT` + `docs/snippets/openspec-workspace-bootstrap.sh` 已支持从外部目录拷贝 skills

## Goals / Non-Goals

**Goals:**

- 定义并落地 **V1.1 Policy**（阶段顺序、Gate、Skill 路由、合法回退）
- 提供 **策略包目录契约** + bootstrap 说明；示例 skills 中文、按阶段拆分（澄清写 proposal、评审写报告、plan 仅 tasks）
- **Phase Artifact Contract**：manifest / Dashboard 按契约展示主产物；execute 不列文档
- **Dashboard V1.1**：时间线顺序、开始时间、中文 UI、MD Preview、SSE 局部刷新
- 更新 Policy 文档与 WORKFLOW 示例

**Non-Goals:**

- 修改 `symphony-ts/openspec/` 内 meta change
- fork OpenSpec CLI 或改 artifact 英文 id
- hydrate、live SSE（仍属可选后续）
- orchestrator 拦截非法 Phase（仍由 agent + Policy 约定）
- V1 人机按钮、PR/commit 自动化

## Decisions

### D1：V1.1 状态机（方案 B）

```
clarify ──C0──► proposal_review ──P2──► plan ──P1──► execute ──► verify ──V1──► archive ──► done
```

| Gate | 过渡 | 通过条件 |
|------|------|----------|
| C0 | clarify → proposal_review | 澄清完成；`proposal.md` 存在且可审 |
| P2 | proposal_review → plan | 评审报告 PASS（需求/范围 OK） |
| P1 | plan → execute | `tasks.md` apply-ready（`openspec status`） |
| V1 | verify → archive | VERIFICATION_REPORT PASS + Validation exit 0 |

**备选**：保持 V1 顺序仅改 Dashboard — 已拒绝（团队选定方案 B）

### D2：策略包与 symphony-ts 边界

| 所有权 | 内容 |
|--------|------|
| **symphony-policy-bundle**（外部） | 中文 skills、openspec config 模板、报告 md 模板、bootstrap、phase-artifact-contract 源文件 |
| **symphony-ts** | 读契约生成 manifest、Dashboard 展示、Policy 文档、WORKFLOW 示例、可选 `policy_bundle.root` 配置项 |

运行时：`SYMPHONY_POLICY_ROOT` 指向策略包；`hooks.after_create` 调用 bundle bootstrap。

**备选**：在 symphony-ts 内改 `.cursor/skills` — 已拒绝（污染 meta 仓、难独立版本化）

### D3：Phase 数组顺序

`V1_BUSINESS_PHASES` 调整为：

```typescript
["clarify", "proposal_review", "plan", "execute", "verify", "archive"]
```

Phase **id** 不变，仅 **顺序** 变化；Dashboard 横向/纵向时间线随之更新。

### D4：阶段产物契约（主产物）

| Phase | 主产物（展示名） | 路径 |
|-------|------------------|------|
| clarify | 需求提案 | `openspec/changes/<ref>/proposal.md` |
| proposal_review | 评审报告 | `.symphony/workflow/phases/proposal_review/评审报告.md`（或 exporter 从 Notes 合成） |
| plan | 任务清单 | `openspec/changes/<ref>/tasks.md` |
| execute | （无文件列表） | runtime 摘要可选：turn 数、最后事件 |
| verify | 验证报告 | `.symphony/workflow/phases/verify/验证报告.md` |
| archive | 归档说明 | `.symphony/workflow/phases/archive/归档报告.md` |

次要产物（design、specs、turn log）默认不展示。

### D5：策略包 Skills 策略

| Phase | Skill | 行为 |
|-------|-------|------|
| clarify | 定制 explore + 写 proposal | `openspec new change` + 仅 proposal artifact |
| proposal_review | symphony-提案评审 | 读 proposal；写评审报告 + Notes `REVIEW_REPORT` |
| plan | continue-change | 循环直到 `tasks.md` done；**不用 ff-change** |
| execute | apply-change | 不变 |
| verify | 主 agent + Validation | 写验证报告 |
| archive | archive-change + 归档说明 | 写归档报告 |

plan 阶段若 apply 仍依赖 design/specs：skill 可在后台生成，Dashboard 不展示（实施时 spike 确认 `applyRequires`）。

### D6：Dashboard UX

- **刷新**：Workflow 页 SSE 收到 snapshot 后 **fetch + 局部更新**，禁止 `location.reload()`
- **时间**：列表/卡片显示 `started_at` / `created_at`；弱化或移除 `Updated` 主展示
- **Preview**：`.md` 用客户端 MD 渲染；`.log` 保持 pre
- **i18n**：指标、按钮、Gate、runtime 状态、产物展示名中文映射

**备选**：关闭 SSE — 仅作临时配置，不作终态

### D7：中文化

- UI、skills 说明、openspec config context/rules、报告模板：**中文**
- Phase id、proposal.md、tasks.md、CLI、ChangeRef、Gate id：**保留英文**；Gate 展示加中文说明

### D8：策略包物理位置

- 首期：`examples/symphony-policy-bundle/` 作为 **symphony-ts 内示例快照**，便于 clone；生产使用独立 git 仓或共享路径
- `bundle.version` 文件；workspace 可选写入 `.symphony/policy-bundle.json` 审计

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| V1 → V1.1 **BREAKING** 导致在跑工单 workpad Gate 语义混乱 | 文档明确；新 workspace 默认 V1.1；旧 workpad 靠 Phase id 仍可解析 |
| plan 仅 tasks 但 apply 需 specs | spike `continue-change`；必要时 plan skill 静默补最小 specs |
| 策略包与 symphony-ts 版本漂移 | `bundle.version` + README 兼容矩阵 |
| 中文报告路径在 Windows/Linux 差异 | exporter 使用 UTF-8；路径 containment 测试 |
| 外部策略包未配置时行为 | 文档强调 `SYMPHONY_POLICY_ROOT`；WORKFLOW 示例保留最小 bootstrap |

## Migration Plan

1. 合并/归档 `symphony-workflow-dashboard` MVP change
2. 在 `examples/symphony-policy-bundle/` 落地 V1.1 策略包示例
3. symphony-ts：Phase 顺序 + manifest 契约 + Dashboard UX
4. 更新 `docs/symphony-agent-workflow.md`（V1.1 专章或替换 V1 状态机）
5. 联调：一条 issue 跑通六阶段 + Dashboard 验收

**回滚**：WORKFLOW 指回 V1 示例 + 旧 Phase 顺序代码 tag；策略包 pin 旧 `bundle.version`

## Open Questions

- plan 阶段是否 **强制** 在 Dashboard 隐藏 design/specs，还是「折叠次要产物」？
- execute runtime 摘要：仅 turn 数，还是含 last_message？
- 策略包独立 git 仓命名与发布流程（本 change 仅提供 examples 快照是否足够）？
