## Context

`README.md` 是仓库对外的第一入口。团队内部以中文协作为主，但 README 仍为英文，且 Roadmap 段已有部分中文，风格不统一。文件末尾存在非 Symphony 内容的 YAML 块（`understand-community`），需清理。

PMS 只读 tracker（`add-pms-tracker-readonly`）已落地，配置与样例在 `docs/pms-tracker.md` 与 `examples/workflow-pms/WORKFLOW.md`。按仓库文档规范，README 只讲「是什么、怎么跑、去哪查细节」，不重复 OAuth/RSA 配置全文。

## Goals / Non-Goals

**Goals:**

- README 中文叙述为主，团队成员无需读英文即可理解项目定位与 Quickstart
- 明确支持 Linear 与 PMS 两种 `tracker.kind`
- 删除脏数据，License 段为文件正常结尾
- 保持现有章节结构（运行、开发、Roadmap、功能说明、贡献、许可证）
- 所有 docs 链接保持有效

**Non-Goals:**

- 翻译 `README.upstream.md`、`SPEC.upstream.md`、`AGENTS.md`
- 全文翻译代码块、命令、环境变量名
- 在 README 写 PMS 写回、Policy 暂缓项详情
- 新增英文版 README 或 i18n 机制

## Decisions

### D1：中文范围

- **选择**：prose 与章节标题用简体中文；技术标识符保持英文
- **理由**：内部可读性与命令可复制性兼顾
- **备选**：中英双语 README — 拒绝，维护成本高且本次仅需内部版

### D2：PMS 在 README 中的呈现（轻量 B）

三处补充，不展开 OAuth：

1. **环境要求**：列出 Linear（`LINEAR_API_KEY`）与 PMS（链接 `docs/pms-tracker.md`）
2. **WORKFLOW 段**：Linear 模板保留；增加 PMS 一句说明 + 样例链接
3. **Roadmap 表格**：新增一行「PMS 只读 tracker ✅」链到 docs

### D3：脏数据处理

- **选择**：删除自 `---\nunderstand-community:` 起至 EOF 的全部内容
- **理由**：与 Symphony 无关，且 truncate 标记 `# Order Service` 表明内容不完整

### D4：Agent setup prompt

- **选择**：`<details>` 内 Agent 提示改为中文说明 + 保留英文 bullet（或全中文说明但 env/命令仍英文）
- **理由**：内部团队使用 Cursor Agent Setup 时更易理解

### D5：Roadmap 与 Policy 引用

- 保留指向 `docs/symphony-agent-workflow.md` 的中文说明
- 「暂缓项：需求平台」改为更准确表述（PMS 读侧已完成；写回仍在 docs TODO）

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 开源/upstream 读者期望英文 README | 保留 `README.upstream.md`；本仓库定位为团队 fork 时可接受 |
| 中文化后链接文字变化导致断链 | tasks 中逐条验证相对路径 |
| PMS 说明过少团队找不到配置 | 明确指向 docs + examples |

## Migration Plan

1. 单 PR 仅改 `README.md`
2. 无需版本发布或代码变更
3. 合并前人工预览 Markdown 渲染（警告框、表格、链接）

## Open Questions

（无阻塞项；结构与前序 explore 讨论已对齐。）
