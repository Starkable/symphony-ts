## Context

Symphony V1.1 使用 workpad Phase、Gate Log 与分散产物路径；Cursor harness 在第 2+ turn 使用固定续跑 Prompt。讨论收敛为：**WORKFLOW.md 唯一配置**、**产物驱动阶段推导**、**无 workpad**、**openspec change 根目录六文件**、handler 由 Symphony 注入为 `/openspec-*` 形式。

当前代码：`config-resolver` 不解析 `workflow:`；`artifact-store` 扫描 `.symphony/workflow/phases/`；`cursor-harness.buildPromptForTurn` 在续跑时跳过 WORKFLOW 模板。

## Goals / Non-Goals

**Goals:**

- 定义并解析 WORKFLOW `workflow.phases` 短表（id、handler、produces、requires_pass）。
- 实现有序阶段推导：扫描 `{change_ref}` 下产物，确定本 turn 目标 phase。
- 每 turn 构建 Prompt：issue 上下文 + 当前 phase + `/{handler}` + 展开后的 `produces` 路径。
- 统一 V1.2 产物契约与 Dashboard manifest 映射。
- 文档与示例 WORKFLOW 更新为 V1.2。

**Non-Goals:**

- workpad（含 Phase/Gate Log）及失败阻塞、tracker 写回。
- OpenSpec CLI 自定义 schema 注册（proposal_review 等作为 CLI artifact id）。
- bundle install/bootstrap 自动化（安装仍为人工/运维）。
- 验证 Cursor CLI 是否解析 Prompt 内 `/skill`（单独 spike，不阻塞 spec 定稿）。

## Decisions

### D1：配置只在 WORKFLOW.md

**决定**：`workflow.phases` 置于 WORKFLOW front matter；不新增 `policy.yaml`、不在 symphony-ts 内置 profile 文件。

**理由**：与讨论一致；换 open-kit 仅改 WORKFLOW。

**备选**：symphony-ts 内置 `openspec-v1.2.yaml` —— 拒绝，避免双源。

### D2：进度真相 = 产物文件

**决定**：取消 workpad Phase；Symphony 推导 `effective_phase`；skill 负责写入 `produces` 路径。

**理由**：用户明确要求；可观测、可 Dashboard 展示、archive 随 change 目录移动。

**备选**：保留 workpad 作缓存 —— 拒绝，避免双轨。

### D3：完成条件

| requires_pass | 条件 |
|---------------|------|
| false / 省略 | `produces` 路径文件存在 |
| true | 文件存在且 front matter `status: pass` |

review / verify / execute / archive 为 `requires_pass: true`；clarify、plan 为 false。

execute：`openspec-apply-change` 成功结束时写 `execute.md` + `status: pass`。

### D4：有序隐含 consumes

**决定**：`phases` 数组顺序即依赖；第 N 阶段开始前，所有前序 `requires_pass: true` 的产物必须已通过。

**理由**：不在 WORKFLOW 重复 `consumes` 列，保持短表。

### D5：archive 产物与 mv

**决定**：archive handler 先在 `openspec/changes/{change_ref}/archive.md` 写入 `status: pass`，再执行 openspec archive mv；done 后在 `openspec/changes/archive/YYYY-MM-DD-{change_ref}/archive.md` 仍可找到。

Symphony 推导 done：active change 路径或 archive 路径下 `archive.md` 为 pass。

### D6：change_ref

**决定**：`workflow.change_ref: kebab_case_issue_id`；由 `issue.identifier` 转 kebab-case；`produces` 中 `{change_ref}` 占位符由 Symphony 展开。

### D7：默认 V1.2 phases 表（文档/示例）

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

（handler 名与 bundle 对齐；`openspec-verify` 与现有 `openspec-verify-change` 在 bundle 任务中拆分。）

### D8：推导算法

```
for phase in workflow.phases in order:
  if phase.produces not complete → effective_phase = phase; break
if all complete → workflow_terminal = done
```

`complete(produces, requires_pass)`：解析路径 → 读文件 → 若 requires_pass 解析 front matter status。

### D9：Prompt 结构（薄正文 + 注入）

WORKFLOW Markdown 正文：角色、ChangeRef 规则、不提交远程等；**不含** Phase 大表与 skill 步骤。

Symphony 每 turn 追加（Liquid 或字符串拼接）：

- 当前 `effective_phase.id`
- `/{handler}`
- 展开 `produces`
- 前序产物只读路径（可选）

**续跑 turn 同样注入**（替换 `cursor-harness` 固定续跑文案）。

### D10：WORKFLOW 启用开关

**决定**：存在 `workflow.version` 且 `phases.length > 0` 时启用 V1.2 推导；否则保持 legacy prompt-only 行为（兼容旧 WORKFLOW，直至明确移除）。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Cursor CLI 不认 Prompt 内 `/handler` | spike 文档化；fallback 在 Prompt 写「读取 .cursor/skills/{handler}」 |
| 空文件 + status pass | spec 要求 skill 写实质内容；Symphony 不验正文 |
| V1.1 并行 workspace 混乱 | BREAKING 文档；`workflow.version: "1.2"` 显式标记 |
| archive 后 change_ref 路径变化 | 扫描 active + archive 目录 |
| bundle 与 symphony-ts 不同步 | tasks 含 bundle follow-up 清单 |

## Migration Plan

1. 发布 V1.2 文档与 WORKFLOW 示例。
2. symphony-ts 实现解析与 dispatch。
3. 更新 artifact-store 产物映射；移除 workpad Phase 依赖（可选保留 workpad 文件解析为 no-op）。
4. 独立仓 bundle：skill 路径、重命名 verify skill、删除 phases 模板 install。
5. 团队：更新 WORKFLOW、人工 install skills、不再使用 V1.1 workpad Phase。

回滚：WORKFLOW 去掉 `workflow:` 段，恢复 V1.1 Prompt（不推荐长期并存）。

## Open Questions

- Cursor `/handler` spike 结果是否要求 harness 参数化 skill 调用（待验证）。
- Dashboard 是否显示 `effective_phase` 替代 workpad Phase（建议：是，读推导结果写入 manifest meta）。
