## 1. 清理与结构

- [x] 1.1 删除 `README.md` License 段之后全部脏数据（`understand-community` 至 EOF）
- [x] 1.2 确认 README 章节结构与原英文版等价（运行、开发、Roadmap、功能、贡献、许可证）

## 2. 中文化

- [x] 2.1 将标题、简介、警告说明、各章节 prose 翻译为简体中文
- [x] 2.2 将 Roadmap 表格与 Policy 说明统一为中文（保留 change 名等技术 id）
- [x] 2.3 将 Agent setup `<details>` 内说明改为中文（命令与环境变量保持原文）
- [x] 2.4 保持所有 CLI / YAML / 代码块内容不翻译

## 3. PMS 补充

- [x] 3.1 在「环境要求」增加 PMS（`tracker.kind: pms`）及 `docs/pms-tracker.md` 链接
- [x] 3.2 在 WORKFLOW 段增加 PMS 一句指引 + `examples/workflow-pms/WORKFLOW.md` 链接
- [x] 3.3 在 Roadmap 表格新增「PMS 只读 tracker」完成项并链到 docs
- [x] 3.4 更新 Roadmap/Policy 表述：PMS 读侧已完成；写回仍见 workflow 文档 TODO

## 4. 验证

- [x] 4.1 逐条检查 README 内相对链接可解析（docs、examples、openspec changes）
- [x] 4.2 确认未修改 `README.upstream.md`
- [x] 4.3 预览 Markdown：警告框、表格、代码块渲染正常
