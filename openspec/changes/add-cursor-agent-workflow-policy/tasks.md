## 1. 文档与 Roadmap



- [x] 1.1 新建 `docs/symphony-agent-workflow.md`：阶段状态机、C0 门禁、Subagent 规则、验证失败路由、Workpad 模板全文

- [x] 1.2 在 workflow 文档末尾添加「暂缓 TODO」（需求平台、orchestrator 门控、OpenSpec 可选集成、澄清超时 sweeper）

- [x] 1.3 更新 `README.md`：增加 Roadmap 短节，链接至 `docs/symphony-agent-workflow.md`



## 2. Workpad 与 WORKFLOW 模板



- [x] 2.1 在 `docs/symphony-agent-workflow.md` 中固化 `.symphony/workpad.md` 模板（Phase、ChangeRef、Clarification、Plan、AC、Validation、Assumptions、Gate Log、Notes）

- [x] 2.2 扩展 `docs/WORKFLOW.template.md`：增加 Cursor Policy prompt 段（按 Phase 路由、C0、blocked、Subagent 引用）

- [x] 2.3 新增 `examples/workflow-cursor-policy/WORKFLOW.md` 可运行样例（front matter + 精简中文 prompt）



## 3. Agent Skills



- [x] 3.1 新增 `.agents/skills/commit/SKILL.md`（对齐 AGENTS.md commit 风格）

- [x] 3.2 新增 `.agents/skills/push/SKILL.md`（push + 开/更新 PR）

- [x] 3.3 新增 `.agents/skills/proposal-review-subagent/SKILL.md`（readonly Proposal Reviewer、`REVIEW_REPORT` 格式）

- [x] 3.4 新增 `.agents/skills/qa-verify-subagent/SKILL.md`（readonly QA Verifier、`VERIFICATION_REPORT` 格式、硬门禁说明）

- [x] 3.5 在 workflow 文档中索引上述 skills 与 Phase 对应关系



## 4. Subagent 降级与 Cursor 说明



- [x] 4.1 在 `docs/symphony-agent-workflow.md` 记录 Cursor Task subagent 首选路径与 CLI 不支持时的降级方案（verifier 独立 turn / verify-request 文件）

- [x] 4.2 在 workflow 文档说明 `fix-cursor-cli-harness` 为试跑前置依赖



## 5. 验证与试跑



- [x] 5.1 人工走查：模糊需求 ticket → 确认 WORKFLOW 文案能导向 `blocked` 且 C0 禁止写代码

- [x] 5.2 人工走查：完整 happy path 文案（clarify → plan → execute → verify Subagent → submit）无 Phase 缺口

- [x] 5.3 在 `docs/symphony-agent-workflow.md` 增加「试跑检查清单」供首次 Cursor Policy 启用使用



## 6. 可选后续（本 change 不实现，仅文档引用）



- [x] 6.1 确认 workflow 文档 TODO 已列出：需求平台 adapter、orchestrator dispatch 门控、OpenSpec 可选绑定


