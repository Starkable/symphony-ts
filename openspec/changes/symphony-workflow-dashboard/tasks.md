## 1. 配置与模块骨架

- [x] 1.1 在 `src/config/types.ts`、`config-resolver`、`defaults` 增加 `artifact_store.root` / `artifact_store.enabled`
- [x] 1.2 在 `docs/WORKFLOW.template.md` 与 `docs/` 运维文档补充 Artifact Store 配置说明与路径示例
- [x] 1.3 新建 `src/artifact-store/` 模块（路径解析、meta/manifest 类型、store 目录 ensure）

## 2. Manifest 与 Workpad 解析

- [x] 2.1 实现 workpad.md 解析器：Phase、ChangeRef、Gate Log、Notes（REVIEW/VERIFICATION 报告）
- [x] 2.2 定义 `manifest.json` / `meta.json` schema 与读写函数
- [x] 2.3 实现 openspec change 目录扫描（proposal/design/tasks/specs）生成 artifacts 条目
- [x] 2.4 单元测试：解析样例 workpad、生成 manifest phases（含 proposal_review）

## 3. Exporter（workspace → store）

- [x] 3.1 实现单工单 export：workpad、openspec 副本、turn logs、阶段 md
- [x] 3.2 在 `runtime-host` turn 结束路径调用增量 export
- [x] 3.3 在 terminal cleanup / `before_remove` 前调用全量 export
- [x] 3.4 路径安全：store 写入 containment 测试（含 `..` 拒绝）
- [x] 3.5 集成测试：模拟 turn 结束与 cleanup 后 store 可读

## 4. Workflow HTTP API

- [x] 4.1 `GET /api/v1/workflows`（status 筛选、合并 running 内存态 + store 索引）
- [x] 4.2 `GET /api/v1/workflows/:issue_identifier` 详情
- [x] 4.3 `GET /api/v1/workflows/:issue_identifier/artifacts/*` 安全读文件
- [x] 4.4 未启用 store 时 API 降级行为与错误码
- [x] 4.5 扩展 `tests/observability/dashboard-server.test.ts` 覆盖新路由

## 5. Dashboard UI — 总览页

- [x] 5.1 新增 workflow 页面模板（Inter、blue-600、symphony-obs 布局）；保留四指标卡片
- [x] 5.2 Active Workflow 卡片：7 Phase 横向时间线（动态节点、pulse/check/pending）
- [x] 5.3 Rate limits 侧栏 + Recent History 区块（读 store/API）
- [x] 5.4 接入 SSE `/api/v1/events` 刷新指标与 active 列表

## 6. Dashboard UI — 详情页与历史页

- [x] 6.1 `/issues/:issue_identifier` 纵向时间线 + 阶段产物列表 + 进度条
- [x] 6.2 Preview Modal（MD/LOG 文本）与 Download 链接
- [x] 6.3 `/history` 搜索/筛选 + 归档列表卡片
- [x] 6.4 终态 `done`/`failed` badge；不展示人机 Action 按钮

## 7. Hydrate 与 Live（Phase 3，可选）

- [ ] 7.1 `after_create` 从 store hydrate workpad + openspec 至 workspace（可配置开关）
- [ ] 7.2 `GET /api/v1/workflows/:id/live` SSE tail 最新 turn log（可选）

## 8. 文档与验收

- [x] 8.1 更新 README 路线图「本地看板 GUI」指向本 change / docs
- [x] 8.2 在 `docs/` 增加 Workflow Dashboard 操作说明（三页导航、store 目录结构）
- [x] 8.3 手工验收清单：active 卡片 → 详情 → 产物 Preview → history；terminal 后仍可查
