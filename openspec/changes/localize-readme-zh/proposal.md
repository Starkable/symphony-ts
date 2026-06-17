## Why

当前 `README.md` 以英文为主，不适合团队内部快速上手；且文件末尾存在误粘贴的脏数据（`understand-community` / `Order Service`）。同时 PMS 只读 tracker 已实现，README 尚未体现 Linear 之外的内部需求平台选项。需要将 README 调整为**中文叙述为主**的团队入口文档，并轻量引入 PMS 指引。

## What Changes

- 将 `README.md` 叙述性内容翻译为简体中文（章节标题、说明段落、Roadmap 表格描述等）
- 保留 CLI 命令、环境变量名、YAML 字段、代码块等技术标识符为原文，确保可复制执行
- 删除 License 段之后的脏数据（第 223 行起至文件末尾）
- 在「环境要求」「WORKFLOW 说明」「Roadmap」三处轻量补充 PMS（`tracker.kind: pms`），并链接至 `docs/pms-tracker.md` 与 `examples/workflow-pms/WORKFLOW.md`
- 统一 Roadmap 中英文混杂段落为中文表述
- **不修改** `README.upstream.md`（仍作 upstream 英文参考）
- **不在 README 展开** PMS OAuth 细节、Policy 全流程或实现说明（仍指向 `docs/`）

## Capabilities

### New Capabilities

- `readme-zh-team`: 面向团队内部的中文 README 文档规范与内容要求（含 PMS 轻量提及与脏数据清理）

### Modified Capabilities

（无。`openspec/specs/` 下无既有 capability spec。）

## Impact

- **文档**：`README.md`（唯一主要变更文件）
- **非目标**：源代码、测试、CLI 行为、`package.json` description
- **依赖**：与已完成的 `add-pms-tracker-readonly` 文档产物（`docs/pms-tracker.md`、`examples/workflow-pms/`）交叉引用
