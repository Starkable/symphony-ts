## 1. 配置 Breaking 变更



- [x] 1.1 更新 `WorkflowCursorHarnessConfig`：删除 `trust`/`yolo`/`outputFormat`；`mode` 收窄为 `"force"`；新增 `model: string | null`

- [x] 1.2 更新 `defaults.ts`：`DEFAULT_CURSOR_MODE = "force"`；移除 trust/yolo/output_format 默认；新增 `DEFAULT_CURSOR_MODEL = null`

- [x] 1.3 更新 `config-resolver.ts`：解析 `model`；拒绝废弃字段；`validateDispatchConfig` 校验 mode 仅 force

- [x] 1.4 实现 `resolveCursorCommand` 跨平台可执行性预检并接入 dispatch 校验

- [x] 1.5 更新 `tests/config/config-resolver.test.ts` 与 `tests/helpers/workflow-config.ts`



## 2. CLI 参数与模块结构



- [x] 2.1 新增 `cursor-cli-args.ts`，实现 `buildCursorCliArgs`（--print / --force / --workspace / -- / --resume / --model）

- [x] 2.2 删除 `buildCursorCliArgs` 中的 `-p`、`-force`、`--continue`、`--trust`、`--yolo`

- [x] 2.3 重写 `tests/agent/backends/cursor/cursor-cli-session.test.ts` 覆盖新参数形态



## 3. stream-json 解析器



- [x] 3.1 新增 `cursor-stream-parser.ts`：逐行 JSON 解析、thinking buffer、tool 名提取（借鉴 cc-connect）

- [x] 3.2 实现 Cursor 事件 → `HarnessRuntimeEvent` 映射（notification / other_message / turn_completed / turn_failed）

- [x] 3.3 从 `system.init` / `result` 提取 `session_id` 与 `usage` token

- [x] 3.4 新增 `tests/agent/backends/cursor/cursor-stream-parser.test.ts`（使用实测 JSON 样例）



## 4. 流式 CLI Runner



- [x] 4.1 重构 `runCursorCli`：stdio stdin/stdout/stderr 均为 pipe；`shell: false`

- [x] 4.2 集成 stream-parser 逐行回调；支持 `onHarnessEvent` 实时事件

- [x] 4.3 实现 `interaction_query` stdin 自动批准兜底

- [x] 4.4 保留 turn 超时、AbortSignal、GBK 解码与 turn 日志 artifact 追加

- [x] 4.5 更新 `cursor-cli-session.test.ts`（mock 流式输出）



## 5. Harness 接线与 Dashboard



- [x] 5.1 更新 `cursor-harness.ts`：使用新 args/runner；`system.init` 时立即 `writeCursorSession`

- [x] 5.2 在 readLoop 回调中 `emitHarnessEvent`，确保 turn 进行中 Dashboard `last_message` 更新

- [x] 5.3 更新 `cursor-event-adapter.ts`：`turn_completed` 携带 usage；移除 regex chat id 主路径

- [x] 5.4 更新 `cursor-harness.test.ts`：断言中间 onEvent 次数 > 2



## 6. 文档与日志



- [x] 6.1 更新 `docs/agent-harness-cursor-spike.md`（新协议、breaking migration、实测附录）

- [x] 6.2 更新 `docs/WORKFLOW.template.md` 与 `docs/agent-harness.md`

- [x] 6.3 更新 `cursor-turn-log.ts` 脱敏逻辑（prompt 在 `--` 后而非 `-p`）



## 7. 验证



- [x] 7.1 运行 `pnpm test` 全量通过（cursor/config 相关用例通过；部分既有 Windows/codex 用例为环境预存失败）

- [x] 7.2 本地手动：`agent --print ... -- "hello"` 与 symphony 跑单 issue 对照（用户已实测 hello/dir）

- [ ] 7.3 本地手动：验证 `--resume <session_id>` 跨 turn 恢复（补 design Open Question）

- [x] 7.4 实现 Windows spawn 解析（`resolveCursorSpawnSpec` + `cmd.exe /c` 包装 `.cmd`/`.bat`）

- [ ] 7.5 本地手动：Windows Symphony 跑单 issue（如 TES-5）不再出现 `spawn EINVAL`/`ENOENT`


