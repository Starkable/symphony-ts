## 1. CLI 与配置基础

- [x] 1.1 在 `package.json` 增加 `pms:probe` script 指向 `dist/src/cli/pms-probe.js`
- [x] 1.2 定义环境变量约定：`PMS_VERIFY_PROJECT`（默认 BCS）、`PMS_VERIFY_ASSIGNEE`（默认 shenxianghong_wb）、`PMS_PROBE_ISSUE_KEY`（可选）
- [x] 1.3 实现 probe CLI 参数解析：`--probe-issue-key`、`--allow-write`、`--transition-to`、`--help`

## 2. 扩展 pms:verify-jql

- [x] 2.1 新增 case `bcs-assignee-in-progress`：`project + status In Progress + assignee in`
- [x] 2.2 新增 case `bcs-status-in-progress`、`bcs-status-开发暂停`、`bcs-status-已提测`（各为独立 JQL search）
- [x] 2.3 当 case 有返回 issue 时，记录 `returnedStatusName` 与 `jqlStatusName` 到报告
- [x] 2.4 区分报告字段 `jqlValid`（HTTP 200）与 `hasMatchingIssues`（total > 0）
- [x] 2.5 扩展或合并报告输出至 `tmp/pms-bcs-verify-report.json`（保留原 `pms-jql-verify-report.json` 兼容）

## 3. 实现 pms:probe 只读探测

- [x] 3.1 实现 `GET /rest/api/2/project/{key}/statuses` 解析并写入 `projectStatuses`
- [x] 3.2 实现 `GET /rest/api/2/issue/{key}/transitions` 解析并写入 `transitions`
- [x] 3.3 实现 `GET /rest/api/2/issue/{key}/comment` 解析并写入 `comments`
- [x] 3.4 未提供 issue key 时 skip transitions/comments，继续 statuses + 调用 verify cases

## 4. 可选写探测（opt-in）

- [x] 4.1 `--allow-write` 时 POST 测试评论（body 含 `[Symphony Probe]` 前缀）
- [x] 4.2 `--allow-write --transition-to <name>` 时在指定工单尝试 transition（复用 transition 名匹配逻辑，记录结果不抛 uncaught）
- [x] 4.3 写探测结果写入 `writeProbe`；默认 `skipped: true`

## 5. 测试与文档

- [x] 5.1 新增 `tests/cli/pms-probe.test.ts`（mock HTTP：参数解析、报告结构、skip 逻辑）
- [x] 5.2 扩展 `tests/cli/pms-smoke.test.ts` 或新增 verify-jql 单测覆盖 BCS case JQL 字符串构建
- [x] 5.3 更新 `docs/pms-tracker.md`：BCS 验证流程、环境变量、报告字段解读、后续 change 门禁说明
- [x] 5.4 在 `examples/workflow-pms/` 或 docs 中给出 BCS 验证命令示例（不含真实 secret）

## 6. 本地联调验收（需真实 PMS 凭据）

- [x] 6.1 配置 OAuth 后运行 `pnpm build && pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md`
- [x] 6.2 设置 `PMS_PROBE_ISSUE_KEY` 运行 `pnpm pms:probe --probe-issue-key BCS-xxxx`
- [x] 6.3 确认 `tmp/pms-bcs-verify-report.json` 中 assignee case 为 200，并记录 status 名对照与 transitions 摘要
- [x] 6.4 将验收结论（PASS/FAIL 要点）附在 PR 或 change `evidence/README.md`（可选）
