# Symphony Workflow 演进梳理

> 本文档汇总 Workflow Dashboard MVP 验收后的讨论结论，作为后续 change / 外部策略包的输入。
> 不涉及代码实现；实现时分别开 change 或在独立 `symphony-policy-bundle` 仓库推进。

---

## 1. 当前已完成（symphony-workflow-dashboard MVP）

| 能力 | 状态 |
|------|------|
| `artifact_store` 配置 + workspace → store export | ✅ |
| Workflow 三页 Dashboard + REST API | ✅ |
| 7 Phase 时间线（含 `proposal_review`） | ✅ |
| terminal 后 History 可读 | ✅ |
| **V1.2 产物驱动阶段推导** | ✅ symphony-ts（`workflow.phases` + 六英文产物） |
| `hydrate_on_create` | ⏸ 未接线（刻意不做） |
| `GET .../live` SSE tail | ⏸ 501（刻意不做） |

> **BREAKING（V1.2 vs V1.1）**：废弃 workpad Phase/Gate 与 `.symphony/workflow/phases/` 中文报告；进度真相改为 `openspec/changes/{change_ref}/` 六文件。详见 [symphony-agent-workflow.md](./symphony-agent-workflow.md#v12-产物驱动模式)。

**本地验证要点**：`WORKFLOW.md` 启用 `artifact_store` + `server.port`；`SYMPHONY_POLICY_ROOT` 可选指向策略包。

---

## 2. 已暴露问题（验收反馈）

### 2.1 Dashboard UX

| 问题 | 根因 |
|------|------|
| 页面「无时无刻在刷新」 | Workflow 页 SSE 收到 `snapshot` 后 `location.reload()` 整页重载；且 agent 事件 + 1s 心跳叠加 |
| 时间显示「Updated」不直观 | 列表用 `updated_at`（export/请求时刻）；running 占位 summary 甚至每次 `new Date()` |
| Preview 体验差 | MD/LOG 用 `<pre>` 纯文本，未渲染 Markdown |
| 指标/按钮仍英文 | Running、Preview、Download、Gate pending 等 |

**短期权宜（仅配置）**：`observability.dashboard_enabled: false` 关闭自动刷新；或增大 `refresh_ms`（只能减慢心跳，不能消除 reload）。

**中期改法（symphony-ts change）**：局部 DOM 更新替代 reload；列表显示「开始时间」；MD Preview 渲染；UI 中文化。

### 2.2 阶段产物展示错位

| 阶段 | 用户期望主产物 | 当前 Dashboard 行为 |
|------|----------------|---------------------|
| 需求澄清 | 需求提案（proposal 需求描述） | 常「暂无产物」（只扫 `phases/clarify/`） |
| 提案评审 | 评审报告 | 常空（报告在 workpad Notes，未映射） |
| 方案规划 | 仅 tasks | 展示 proposal + tasks + design + specs（openspec 一次 ff 全出） |
| 执行实现 | 代码，无文档列表 | 展示 tasks.md + 全部 cursor-turn log |
| 验证 | 验证报告 | 常空（Notes 未映射） |
| 归档 | 归档报告 | 常空 |

**根因**：`manifest-builder.ts` 用「扫目录 + 粗糙 filter」，与 V1 Agent 真实产出（openspec 一次性生成 + workpad Notes）不一致。

---

## 3. 架构原则（讨论共识）

### 3.1 三层所有权

```
Symphony Policy（WORKFLOW + workpad Phase/Gate + skills 路由）
        ↓
外部 OpenSpec 策略包（定制 skills / config 模板 / 阶段契约 / 中文说明）
        ↓
issue workspace（openspec/changes/<ChangeRef>/ + .symphony/）
        ↓
symphony-ts（orchestrator + artifact_store + Dashboard，读契约展示）
```

### 3.2 三个「openspec」不要混淆

| 路径 | 用途 | 是否定制业务流 |
|------|------|----------------|
| `symphony-ts/openspec/` | 开发 symphony-ts 自身的 change | ❌ 不动 |
| **外部策略包** `SYMPHONY_POLICY_ROOT` | 团队维护的 skills + 模板 + bootstrap | ✅ 在这里改 |
| `workspace/openspec/` | 每个工单运行时实例 | Agent 读写 |

**禁止**：在 `f:\project\symphony-ts\openspec\` 里改业务工单流程。

**推荐**：新建独立目录/仓库（如 `symphony-policy-bundle`），运行时：

```powershell
$env:SYMPHONY_POLICY_ROOT = "F:/symphony-policy-bundle"
```

`hooks.after_create` 执行 bundle 内 bootstrap：seed `openspec/config.yaml`（可选）+ 拷贝定制 skills。

现有 `docs/snippets/openspec-workspace-bootstrap.sh` 已支持从 `SYMPHONY_POLICY_ROOT` 拷贝 skills，注释写明可为 policy bundle。

### 3.3 OpenSpec 不够用时

- 优先改 **策略包内 skills**（fork `openspec-ff-change` 等）
- 可用 `openspec continue-change` **按 artifact 逐个**生成，替代 ff 一次全出
- Symphony 自有报告落盘：`.symphony/workflow/phases/<阶段>/` + 模板
- 仅当要改 artifact id / CLI 行为时才考虑 fork OpenSpec CLI（一般不需要）

---

## 4. 目标：阶段产物契约（Phase Artifact Contract）

### 4.1 阶段顺序（已拍板：方案 B / V1.1）

```
clarify → proposal_review → plan → execute → verify → archive
```

OpenSpec change：`openspec/changes/symphony-workflow-v1-1/`。需改 Policy 文档、WORKFLOW prompt、Gate 表、策略包 skills、Dashboard Phase 数组顺序。

### 4.2 每阶段主产物（展示层中文名 ↔ 磁盘路径）

| 阶段 id | 中文名 | 主产物（展示） | 推荐路径（机器层可仍英文） |
|---------|--------|----------------|---------------------------|
| `clarify` | 需求澄清 | 需求提案 | `openspec/changes/<ref>/proposal.md` |
| `proposal_review` | 提案评审 | 评审报告 | `.symphony/workflow/phases/proposal_review/评审报告.md` 或 Notes 合成 |
| `plan` | 方案规划 | 任务清单 | `openspec/changes/<ref>/tasks.md` |
| `execute` | 执行实现 | （不列文件） | 可选 runtime 摘要：turn 数、最后事件 |
| `verify` | 验证 | 验证报告 | `.symphony/workflow/phases/verify/验证报告.md` 或 Notes 合成 |
| `archive` | 归档 | 归档说明 | `.symphony/workflow/phases/archive/归档报告.md` |

**次要产物（默认折叠或不展示）**：`design.md`、`specs/*`、`cursor-turn-*.log`（execute 阶段）。

### 4.3 Gate 展示

内部 id 保留 `C0/P1/P2/V1`；Dashboard 可显示为「澄清门禁 (C0)：待通过」等中文。

---

## 5. 中文化策略

**原则**：叙述与 UI 用中文；Phase id、OpenSpec 标准文件名、CLI、ChangeRef 保留英文。

| Tier | 内容 | 改在哪 |
|------|------|--------|
| 1 | Dashboard 按钮、状态、产物展示名 | symphony-ts |
| 2 | Skills 步骤说明、WORKFLOW prompt | 策略包 |
| 3 | openspec `config.yaml` context/rules → 制品正文中文 | 策略包 |
| 4 | 中文报告模板、phases 子目录 | 策略包 |
| 5 | 中文文件名替代 proposal.md | 不推荐（除非 fork CLI） |

策略包示例结构见 §6。

---

## 6. 独立 bundle 仓库目录（已实现）

```
symphony-openspec-bundle/         # 独立 git 仓库，F:/project/symphony-openspec-bundle
├── bundle.yaml
├── README.md
├── skills/                       # 全部 runtime skill → install → workspace/.cursor/skills/
├── openspec/config.yaml
├── templates/
├── bootstrap/install.sh|install.ps1
└── docs/phase-artifact-contract.md
```

symphony-ts 仅保留 `examples/symphony-openspec-bundle/README.md` 指向独立仓。

---

## 7. 建议后续 change 拆分

| Change | 仓库 | 范围 |
|--------|------|------|
| **symphony-workflow-dashboard-ux** | symphony-ts | 刷新策略、开始时间、MD Preview、UI 中文、execute 隐藏产物 |
| **symphony-workflow-phase-contract** | symphony-ts | manifest-builder 按契约映射；Notes → 合成报告 artifact |
| **symphony-policy-bundle** | 新仓/新目录 | 定制 skills、bootstrap、中文模板、V1.1 流程（若选方案 B） |
| **symphony-workflow-dashboard** | symphony-ts | MVP 已完；7.1/7.2 仍可选或归档后另开 |

**推荐顺序**：

1. 定稿 §4.1 阶段顺序（A 或 B）
2. 写策略包 `phase-artifact-contract.md` + bootstrap
3. symphony-ts：phase-contract + dashboard-ux
4. 联调验收

---

## 8. 配置速查（本地验证）

```yaml
# WORKFLOW.md
artifact_store:
  enabled: true
  root: F:/symphony-artifacts
  hydrate_on_create: false
server:
  port: 4321
observability:
  dashboard_enabled: true   # 验收 UX 前可 false 减少刷新
  refresh_ms: 2000
```

```powershell
$env:SYMPHONY_POLICY_ROOT = "F:/symphony-policy-bundle"
$env:LINEAR_API_KEY = "..."
node F:\project\symphony-ts\dist\src\cli\main.js .\WORKFLOW.md --acknowledge-high-trust-preview --port 4321
```

---

## 9. 决策状态（已锁定）

- [x] 阶段顺序：**方案 B（V1.1）** — 实现见 `openspec/changes/symphony-workflow-v1-1/`
- [x] OpenSpec 定制：**独立仓** `symphony-openspec-bundle/`，不改 `symphony-ts/openspec/`
- [x] Dashboard：V1.1 产物契约 + 中文 UI + 局部 SSE 刷新
- [ ] execute 阶段：完全空白还是保留一行 runtime 摘要？（design 倾向：保留 turn 数摘要）
- [x] 策略包：**独立 git 仓库** `symphony-openspec-bundle`（与 symphony-ts 同级）；symphony-ts 见 `examples/symphony-openspec-bundle/README.md`
- [ ] MVP change `symphony-workflow-dashboard`：是否先 archive，再 `/opsx:apply symphony-workflow-v1-1`

---

## 10. 相关文档

- [workflow-dashboard.md](./workflow-dashboard.md) — Dashboard 操作与验收
- [symphony-agent-workflow.md](./symphony-agent-workflow.md) — V1 Policy
- [snippets/openspec-workspace-bootstrap.sh](./snippets/openspec-workspace-bootstrap.sh) — workspace 注入
- OpenSpec change：`openspec/changes/symphony-workflow-dashboard/`
