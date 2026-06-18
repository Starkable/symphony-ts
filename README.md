# Symphony-ts

**本项目是 [OpenAI Symphony](https://github.com/openai/symphony) 的非官方 TypeScript 实现。**

Symphony-ts 将项目工作转化为隔离、自主的实现运行：从需求平台读取工单，为每个 issue 创建独立 workspace，在边界内运行 coding agent，并为运维提供清晰的运行时可见性、重试与控制界面。

> [!WARNING]
> Symphony 仅适用于可信环境。

![Symphony 演示：Linear 工单跟踪与 Symphony 可观测性仪表盘](.github/media/demo.png)

## 运行 Symphony

### 环境要求

- Node.js `>= 22`
- 目标仓库中存在有效的 `WORKFLOW.md`
- 需求平台凭据：
  - **Linear**：环境变量 `LINEAR_API_KEY`
  - **PMS（爱奇艺内部 Jira）**：`tracker.kind: pms` — 配置见 [docs/pms-tracker.md](docs/pms-tracker.md)，字段对照见 [docs/pms-field-mapping.md](docs/pms-field-mapping.md)
- 支持 app-server 模式的 coding agent 运行时，例如 `codex app-server` 或 Cursor CLI

### 安装

```bash
npm install -g symphony-ts
```

验证 CLI 是否可用：

```bash
symphony --help
```

### 快速开始

1. 进入希望 Symphony 操作的仓库目录。
2. 在该仓库中创建 `WORKFLOW.md`。
3. 配置需求平台凭据（Linear 示例：导出 `LINEAR_API_KEY`）。
4. 在仓库根目录启动 Symphony。

```bash
cd /path/to/your-repo
export LINEAR_API_KEY=your-linear-token
symphony ./WORKFLOW.md --acknowledge-high-trust-preview --port 4321
```

若不传入路径，Symphony 默认读取 `./WORKFLOW.md`：

```bash
symphony --acknowledge-high-trust-preview --port 4321
```

也可不全局安装，直接通过 npx 运行：

```bash
npx symphony-ts ./WORKFLOW.md --acknowledge-high-trust-preview --port 4321
```

Symphony **不会**自动生成 `WORKFLOW.md`。它期望仓库内有一份自有的 workflow 文件，并默认从当前工作目录读取 `./WORKFLOW.md`。

<details>
<summary>Agent 安装引导提示词</summary>

将以下内容发给 Agent，用于在本仓库中安装并启动 Symphony（命令与环境变量保持原文）：

```text
在本仓库中安装并启动 Symphony。

要求：
- 创建或更新 WORKFLOW.md（Linear 或 Pms）
- 从环境变量读取 LINEAR_API_KEY / PMS OAuth 凭据；若缺失，明确告知缺少哪个变量
- 安装 symphony-ts，并使用必需的 --acknowledge-high-trust-preview 标志启动 Symphony
- 若启动失败，停止并报告失败的具体步骤与命令
```

</details>

### `WORKFLOW.md` 模板（Linear）

```md
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: your-linear-project-slug
workspace:
  root: ~/code/symphony-workspaces
codex:
  command: codex app-server
server:
  port: 4321
---

You are working on Linear issue {{ issue.identifier }}.
Implement the task, validate the result, and stop at the required handoff state.
```

将上述内容复制到仓库根目录的 `WORKFLOW.md`，启动前至少修改：

- `tracker.project_slug`
- `workspace.root`
- `codex.command`

**使用 PMS：** 将 `tracker.kind` 设为 `pms`，并配置 `oauth.*` 与 `project_slug`（Jira projectKey）。配置与联调见 [docs/pms-tracker.md](docs/pms-tracker.md)，**字段含义对照**见 [docs/pms-field-mapping.md](docs/pms-field-mapping.md)，样例见 [examples/workflow-pms/WORKFLOW.md](examples/workflow-pms/WORKFLOW.md)。

若需要 Web 仪表盘，在 workflow 中保留 `server.port`，或在 CLI 上传 `--port`。仪表盘会先渲染服务端快照，再通过 SSE 在浏览器中持续更新。

若 agent workflow 需要访问启动 shell 中的环境变量，可在 `codex.command` 中配置 Codex 继承环境，例如：

```yaml
codex:
  command: codex --config shell_environment_policy.inherit=all app-server
```

若 agent 需要在 turn 内 push 分支、开 PR 或调用外部 API，还需配置允许网络访问的 turn sandbox 策略，而非仅依赖 minimal 的 `workspaceWrite` sandbox。

若某外部 CLI 仍无法读取所需凭据，请在启动 Symphony 前通过环境变量注入该工具的凭据。

所有支持字段、默认值与行内说明的完整参考见 [docs/WORKFLOW.template.md](docs/WORKFLOW.template.md)。

### 运行后你会得到什么

Symphony 启动后将：

- 从需求平台 poll 符合条件的工单
- 为每个 issue 创建独立 workspace
- 在该 workspace 内运行 coding agent
- 在设置 `--port` 或 `server.port` 时暴露本地仪表盘与 JSON API
- 向运维人员展示重试、reconcile 与 cleanup 状态

### 开发

开发 Symphony 本身需要：

- Node.js `>= 22`
- pnpm `>= 10`
- 支持 `codex app-server` 的 Codex CLI

```bash
pnpm install
pnpm build
node dist/src/cli/main.js --help   # verify the build
```

运行检查：

```bash
pnpm test           # run all tests once
pnpm test:watch     # watch mode
pnpm typecheck      # TypeScript type check only
pnpm lint           # Biome lint check
pnpm format         # Biome auto-format
```

### 从源码运行

若开发 Symphony 本身而非使用已发布的 CLI：

```bash
pnpm install
pnpm build
node dist/src/cli/main.js --acknowledge-high-trust-preview
```

Linear 配置、`WORKFLOW.md` 与排障的完整 walkthrough 见 [docs/DEV_GUIDE.md](docs/DEV_GUIDE.md)。

## 路线图

| 项 | 状态 |
| --- | --- |
| Symphony 与 Linear 集成 | ✅ 已完成 |
| PMS 只读 tracker（`tracker.kind: pms`） | ✅ 已完成 — [配置](docs/pms-tracker.md) · [字段对照](docs/pms-field-mapping.md) |
| Cursor CLI agent harness | 🟡 进行中（[fix-cursor-cli-harness](openspec/changes/fix-cursor-cli-harness/)） |
| Cursor Policy 工作流 | ✅ V1 OpenSpec 默认 — [symphony-agent-workflow.md](docs/symphony-agent-workflow.md)（V2 Subagent/Git 见同文档） |
| 支持更多平台（如 GitHub Projects） | 🟡 计划中 |
| 本地看板 GUI | 🟡 计划中 |
| 支持更多 coding agent（如 Claude Code 调度） | 🟡 计划中 |

Agent 无人值守 Policy（V1：Workpad + OpenSpec 默认；V2：Subagent、Git）详见 [docs/symphony-agent-workflow.md](docs/symphony-agent-workflow.md)。PMS 写回与 orchestrator 门控等见该文档 TODO 节。

若希望 Symphony 支持其他需求平台，欢迎提 issue 告知。

## Symphony 做什么

Symphony 是一个长期运行的服务，它会：

- 监控需求平台中的符合条件工单
- 为每个 issue 创建确定性的独立 workspace
- 从 `WORKFLOW.md` 渲染仓库自有的 workflow prompt
- 在隔离的执行上下文中运行 coding agent
- 处理重试、reconcile 与 cleanup
- 暴露结构化日志与面向运维的状态界面

典型场景中，Symphony 监听 Linear 或 PMS 上的就绪工单，dispatch agent 运行，由 agent 产出 CI 状态、Review 反馈、Pull Request 等工作成果；运维人员聚焦业务本身，而非逐 turn 监督 agent。

## 为什么团队使用它

- 将 tracker 工单转化为自主实现运行
- 按 issue 隔离 agent 工作，避免共享同一可变目录
- 将 workflow 策略保留在仓库内
- 并发运行多个 agent 而不丢失可观测性
- 引入 AI 辅助工程的高层次运行模型

## 贡献

扩展本 TypeScript 实现时，请与 [`SPEC.upstream.md`](SPEC.upstream.md) 中的 upstream 产品模型保持一致，并遵循 [`AGENTS.md`](AGENTS.md) 中的仓库工作流。

## 许可证

本仓库采用 [`Apache-2.0`](LICENSE) 许可证。关于 upstream OpenAI Symphony 与本非官方 TypeScript 实现的归属说明，见 [`NOTICE`](NOTICE)。
