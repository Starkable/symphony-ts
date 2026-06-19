## ADDED Requirements

### Requirement: WORKFLOW workflow 段解析

Symphony SHALL 从 WORKFLOW.md YAML front matter 解析 `workflow` 对象，至少包含 `version`、`change_ref` 规则、`phases` 数组。每个 phase SHALL 包含 `id`、`handler`、`produces`；`requires_pass` 为可选布尔。

#### Scenario: 合法 workflow 配置

- **WHEN** WORKFLOW front matter 含 `workflow.version: "1.2"` 且 `phases` 非空
- **THEN** config resolver SHALL 暴露结构化 `WorkflowConfig` 供 runtime 使用

#### Scenario: 缺少 workflow 段

- **WHEN** WORKFLOW 无 `workflow` 或 `phases` 为空
- **THEN** Symphony SHALL 不启用 V1.2 产物推导（legacy prompt-only 行为）

### Requirement: produces 路径占位符

`produces` 字符串 SHALL 支持 `{change_ref}` 占位符；runtime SHALL 在扫描与 Prompt 注入前替换为当前 issue 的 change_ref。

#### Scenario: 占位符替换

- **WHEN** produces 为 `openspec/changes/{change_ref}/tasks.md` 且 change_ref 为 `bcs-1234`
- **THEN** 扫描路径 SHALL 为 `openspec/changes/bcs-1234/tasks.md`

### Requirement: 配置校验

启动或首次 dispatch 时，若 `workflow.phases` 中同一 `id` 重复或 `produces`/`handler` 缺失，Symphony SHALL 失败并记录明确错误（不 silent fallback）。

#### Scenario: 重复 phase id

- **WHEN** 两个 phase 的 `id` 均为 `plan`
- **THEN** config 校验 SHALL 失败
