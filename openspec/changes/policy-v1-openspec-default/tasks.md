## 1. 核心文档

- [x] 1.1 在 `docs/symphony-agent-workflow.md` 新增「V1 OpenSpec 默认模式」：Phase 表、Gate、ChangeRef、Workpad 瘦身模板、失败策略、V1/V2 对照
- [x] 1.2 将现有 Subagent 硬门禁、`blocked` 等人、`submit`/`handoff` 标为 V2；V1 主 agent 自审/自验写入 V1 节
- [x] 1.3 更新 `docs/WORKFLOW.template.md`：OpenSpec V1 prompt 段、`tasks.md ## Validation` 约定、`after_create` openspec CLI 说明
- [x] 1.4 更新 `README.md` Roadmap：Policy V1 OpenSpec 默认一句 + 链接

## 2. WORKFLOW 示例

- [x] 2.1 重写 `examples/workflow-cursor-policy/WORKFLOW.md`：V1 Phase 路由、OpenSpec skills 引用、ChangeRef 规则、禁止 AskUserQuestion
- [x] 2.2 新增 `examples/workflow-pms-openspec/WORKFLOW.md`：PMS tracker + V1 Policy prompt（基于 `workflow-pms` + V1 段）
- [x] 2.3 在 workflow 文档试跑检查清单增加：openspec CLI、清晰/模糊 ticket 两条

## 3. Skills（可选与 V2 预留）

- [x] 3.1 新增 `.agents/skills/symphony-v1-policy/SKILL.md`：无人值守约束、ChangeRef 绑定、每 Phase 允许/禁止摘要
- [x] 3.2 在 workflow 文档索引 V1 默认 skills 路径：`.cursor/skills/openspec-*` 与可选 `symphony-v1-policy`
- [x] 3.3 确认 V1 WORKFLOW 不引用 `commit`/`push`/`qa-verify-subagent`（V2 再启用）

## 4. 验证

- [x] 4.1 人工走查：V1 WORKFLOW 文案覆盖 clarify → done 无 Phase 缺口
- [x] 4.2 人工走查：模糊 ticket 导向 `failed`/`CLARIFY_BLOCKED` 且未改 `src/`
- [x] 4.3 文档内 Validation 示例与 `tasks.md ## Validation` 格式一致

## 5. 暂缓（本 change 仅文档引用）

- [x] 5.1 在 workflow 文档 TODO 确认：V2 Subagent、Git/PR、sync-specs、orchestrator 门控仍列于暂缓项

## Validation

- [x] `pnpm test`
- [x] `pnpm lint`
