## 1. 共享判定逻辑



- [x] 1.1 新增 `src/workflow/workflow-harness-stop.ts`：`isWorkflowAllComplete({ workspacePath, issueIdentifier, workflow })`

- [x] 1.2 补充 `tests/workflow/workflow-harness-stop.test.ts`：allComplete / 无 phases / 未完成



## 2. Cursor harness



- [x] 2.1 在 `cursor-harness.ts` turn 成功完成后调用 `isWorkflowAllComplete`，true 则 break

- [x] 2.2 记录 structured log `harness_stop_workflow_done`

- [x] 2.3 补充 `tests/agent/backends/cursor/cursor-harness.test.ts`：mock allComplete → 单 turn 后退出



## 3. Codex runner



- [x] 3.1 在 `runner.ts` turn 循环同等位置接入 workflow done break

- [x] 3.2 补充 runner 单测或扩展现有 test 覆盖 done 停止



## 4. 文档与验证



- [x] 4.1 更新 `docs/symphony-agent-workflow.md`：done 后 harness 停止、PMS 写回时序、与 max_turns 关系

- [x] 4.2 运行相关测试全绿

- [ ] 4.3 手动 e2e：BCS 工单 archive 后日志含 `harness_stop_workflow_done`、`worker_exit_normal`、`pms_writeback`，PMS 为已提测

