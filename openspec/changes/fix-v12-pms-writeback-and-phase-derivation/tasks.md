## 1. 归档目录产物路径解析

- [x] 1.1 新增 `src/workflow/resolve-artifact-path.ts`：active 路径优先，缺失时扫描 `openspec/changes/archive/*-{change_ref}/`
- [x] 1.2 重构 `derive-effective-phase.ts` 使用统一路径解析（替换仅 archive 阶段的 inline fallback）
- [x] 1.3 补充 `tests/workflow/derive-effective-phase.test.ts`：全产物仅在 archived 目录 → `done`；多 archive 目录取最新；active 优先

## 2. V1.2 写回信号

- [x] 2.1 新增或扩展 `src/workflow/writeback-signal.ts`：`resolveWritebackSignal({ workpadContent, workspacePath, workflow })` 合并 workpad 与产物 done
- [x] 2.2 扩展 `PmsWritebackService`：`processCompletionSignal` 接受 `workflow` 参数，日志增加 `signal_source`
- [x] 2.3 更新 `runtime-host.finalizeWorkerExecution`：传入 `config.workflow`，调用新写回入口
- [x] 2.4 补充 `tests/tracker/pms/pms-writeback.test.ts`：无 workpad + mock allComplete → transition 提测；幂等 skip 已提测

## 3. Continuation 抑制

- [x] 3.1 worker 退出路径快照 `workflowComplete`（退出瞬间 `deriveEffectivePhase.allComplete`）
- [x] 3.2 修改 `OrchestratorCore.onWorkerExit`：V1.2 且 `workflowComplete === true` 时不 schedule continuation retry
- [x] 3.3 补充 orchestrator 单测：archive 完成后无 continuation 入队

## 4. 文档与验证

- [x] 4.1 更新 `docs/pms-field-mapping.md` 写回矩阵：增加 V1.2 产物 done 行
- [x] 4.2 更新 `docs/symphony-agent-workflow.md`：V1.2 与 PMS 写回边界说明
- [x] 4.3 运行 `pnpm test` 全绿（本变更相关测试全绿；全量套件存在 Windows/Codex 环境预存失败）
- [ ] 4.4 手动 e2e：BCS 测试工单 V1.2 全流程 → archive 后 PMS 已提测、无 clarify 回退 turn
