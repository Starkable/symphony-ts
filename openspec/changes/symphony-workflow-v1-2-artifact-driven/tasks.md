## 1. 配置解析

- [x] 1.1 在 `config/types.ts` / `config-resolver.ts` 增加 `WorkflowConfig`、`WorkflowPhaseConfig`（id、handler、produces、requires_pass）
- [x] 1.2 从 WORKFLOW front matter 解析 `workflow` 段；缺失时 `workflowConfig` 为 null
- [x] 1.3 校验 phase id 唯一、handler/produces 非空；非法配置启动失败
- [x] 1.4 实现 `issue.identifier` → kebab-case `change_ref` 与 `{change_ref}` 路径展开
- [x] 1.5 单元测试：合法/非法 workflow YAML、占位符展开

## 2. 产物完成判定与阶段推导

- [x] 2.1 新增 `src/workflow/artifact-completion.ts`：`file_exists`、`front_matter_status_pass` 解析
- [x] 2.2 实现 `deriveEffectivePhase(phases, workspacePath, changeRef)` 有序扫描算法
- [x] 2.3 archive 完成：扫描 active change 与 `openspec/changes/archive/*/` 下 `archive.md`
- [x] 2.4 单元测试：各阶段完成/未完成、review fail、全 done 场景

## 3. Prompt 与 Cursor harness

- [x] 3.1 扩展 `buildTurnPrompt` / 新 builder：V1.2 时追加 effective_phase、`/{handler}`、produces 路径
- [x] 3.2 修改 `cursor-harness.buildPromptForTurn`：续跑 turn 仍走 V1.2 注入（移除仅英文续跑分支或与其合并）
- [x] 3.3 dispatch 前读取 workspace 产物推导 effective_phase（需 workspacePath + issue）
- [x] 3.4 测试：mock workspace 文件，断言 Prompt 含 handler 与路径

## 4. Artifact Store / Dashboard

- [x] 4.1 更新 `phase-artifacts.ts` / `openspec-scan.ts`：V1.2 六文件名映射，移除 `.symphony/workflow/phases` 主产物依赖
- [x] 4.2 manifest `current_phase` 使用推导 effective_phase（无 workpad Phase）
- [x] 4.3 workpad 解析改为可选；无 workpad 时 exporter 不失败
- [x] 4.4 更新 workflow Dashboard 相关测试

## 5. 文档与示例

- [x] 5.1 重写 `docs/symphony-agent-workflow.md` V1.2 章节（产物真相、无 workpad、WORKFLOW 短表、推导算法）
- [x] 5.2 更新 `docs/WORKFLOW.template.md` 与 `examples/workflow-cursor-policy/WORKFLOW.md`（含完整 `workflow.phases`）
- [x] 5.3 更新 `docs/workflow-dashboard.md` 产物路径说明
- [x] 5.4 在 `docs/symphony-workflow-evolution-plan.md` 或 change 内注明 **BREAKING** 相对 V1.1

## 6. symphony-openspec-bundle 协调（独立仓 follow-up）

- [x] 6.1 文档列出 bundle 需同步项：六产物路径、skill 写 `execute.md`/`proposal_review.md` 等、`openspec-verify` 命名
- [x] 6.2 移除 install 对 `.symphony/workflow/phases` 中文模板拷贝（或标 deprecated）
- [x] 6.3 提供 V1.2 薄 Prompt 与 WORKFLOW 片段供团队粘贴

## 7. 验证

- [x] 7.1 `pnpm typecheck` 与 `pnpm test` 全通过
- [x] 7.2 手工：mock workspace 六文件递进，确认推导 phase 与 Prompt 注入
- [ ] 7.3 （可选）Cursor CLI spike：`/{handler}` 在 Prompt 中是否生效，结论写入 design Open Questions

## Validation

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm lint`（变更文件已通过 biome check；全仓存在既有 lint 债务）
