# Workflow Dashboard

Symphony 在启用 `artifact_store` 后提供三页 Workflow Dashboard（样式参考 symphony-obs 原型，主色 blue-600）：

| 路径 | 说明 |
|------|------|
| `/` | 总览：Running/Retry/Token/Runtime 指标 + Active Workflows 卡片 |
| `/issues/:issue_identifier` | 需求详情：V1.1 六阶段纵向时间线 + Markdown Preview |
| `/history` | 已归档工单列表 |

## 配置

在 `WORKFLOW.md` front matter 中：

```yaml
artifact_store:
  enabled: true
  root: D:/symphony-artifacts   # 或 $SYMPHONY_ARTIFACT_STORE
  hydrate_on_create: false
server:
  port: 3000
```

启用后 orchestrator 会在 worker turn 结束、terminal cleanup 前将 workspace 内容 export 到：

```
<artifact_store.root>/<issue_identifier>/
  meta.json
  manifest.json
  openspec/changes/<change_ref>/          # V1.2 六产物（proposal_review / execute / verification / archive 等）
  openspec/changes/archive/<date-ref>/    # archive 后仍可访问
  logs/                                   # cursor-turn-*.log
  .symphony/workpad.md                    # 可选 legacy；V1.2 不依赖
```

## V1.2 产物路径

| Phase | 主产物（相对 change 根目录） |
|-------|------------------------------|
| clarify | `proposal.md` |
| proposal_review | `proposal_review.md` |
| plan | `tasks.md` |
| execute | `execute.md` |
| verify | `verification.md` |
| archive | `archive.md`（active 或 `archive/YYYY-MM-DD-{ref}/`） |

`manifest.json` 的 `current_phase` 由 Symphony **扫描产物推导**，不读 workpad Phase。

## API

| 方法 | 路径 |
|------|------|
| GET | `/api/v1/workflows?status=active\|archived\|all` |
| GET | `/api/v1/workflows/:issue_identifier` |
| GET | `/api/v1/workflows/:issue_identifier/artifacts/<relative_path>` |

未启用 `artifact_store` 时，`/api/v1/workflows` 返回 503；`/` 仍展示经典表格 Dashboard。

## 手工验收清单

1. 配置 `artifact_store` 并启动 `opensymphony run --port 3000`
2. 运行至少一个 issue 至 turn 结束，确认 store 目录出现 `manifest.json`
3. 打开 `/` 查看 Active Workflow 横向 7 Phase 时间线
4. 点击工单进入 `/issues/BCS-xxx`，Preview 阶段 md/log
5. 工单 terminal 后 workspace 删除，History 仍可访问归档

## 与 V1.1 Policy 的关系

Dashboard 展示 **V1.1 六阶段**（顺序：`clarify → proposal_review → plan → execute → verify → archive`）。各阶段**主产物**见独立仓 `symphony-openspec-bundle/docs/phase-artifact-contract.md`；execute 阶段不列 log 文件，可选显示 runtime 摘要。

列表/卡片显示 `started_at`（来自 `meta.created_at`），SSE 触发局部 fetch 更新，不再整页 `location.reload()`。

## 策略包

设置 `SYMPHONY_POLICY_ROOT` 指向 **symphony-openspec-bundle** 独立仓库，在 workspace `after_create` 调用 `bootstrap/install.sh`。详见 `examples/symphony-openspec-bundle/README.md`。
