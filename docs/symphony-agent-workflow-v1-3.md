# Symphony Agent 工作流 V1.3（状态机 + 中文 Composer）

V1.3 将**阶段推进**从「扫描 workspace 产物推导 phase」改为 **`.symphony/run-state.json` 状态机**；Prompt 由服务内 **中文 Composer** 统一拼装，`WORKFLOW.md` **仅 YAML front matter**，不含 Prompt 正文。

与 V1.2 对比见 [symphony-agent-workflow.md](./symphony-agent-workflow.md)。Harness 与写回见 [agent-harness.md](./agent-harness.md)。

## 架构

```
WORKFLOW.md（workflow.version: "1.3" + stages 配置，无正文）
        │
        ▼
run-state.json → 当前 stage / Gate 记录 / complete
        │
        ▼
每 turn：Composer（Issue + Task/skill + 产物索引 + Deliverable）
        │
        ▼
Turn 结束 → Gate → 通过则 advance stage
        │
        ▼
artifacts/{change_ref}/（Agent 读写；与 repos/ 分离）
```

## 配置要点

- `workflow.version: "1.3"`
- 每个 stage：`id`、`skill`（全局已安装的 Agent skill id）、可选 `domain`（`analysis` | `implement`）、`reads_from`、`outputs`、`gates`、`shell_command`
- 未写 `produces` 时默认：`artifacts/{change_ref}/{stage_id}.json`；pack 内建 stage 默认逻辑名见 `v13-stage-catalog`（如 `intake_review` → `review.json`）
- V1.3 下 **忽略** `WORKFLOW.md` Markdown 正文作为 `promptTemplate`

## Run state

路径：`.symphony/run-state.json`（按 workspace）。

字段包括：`changeRef`、`currentStageId`、`complete`、各 stage 的 gate 结果、`manualApprovals`、Harness 用 `lastHarnessStageId`（stage 变更时新 session）。

## Gate

| 类型 | 行为 |
|------|------|
| `schema_valid` | 校验产物存在与 JSON 形状（如 `review.json` 的 `status`） |
| `shell` | 执行 stage 配置的 `shell_command` |
| `manual` | 需 `run_state.manualApprovals[stageId]` 为 true |
| `optional_output` | 产物可选 |

`intake_review` 且 `review.json` 为 `status: rejected` 时 Gate 失败，写回信号 `intake_rejected`（PMS 映射为 clarify_blocked 类评论）。

## 域与 materialize

- **analysis** 域：不触发业务仓 materialize
- **implement** 域：进入 implement stage 时触发 materialize + 分支（见 materialization hook）

## Session 策略

- **换 stage** → 新 Harness session
- **同 stage continuation** → 续同一 session

## 样例

见仓库根目录 `examples/workflow-v1-3-pms/WORKFLOW.md`（PMS 字段 + 默认 stage 链）。

## Skill 部署

Stage skill 在 Agent 环境**全局安装**；Symphony 不再在 workspace `after_create` 中安装 skill bundle。
