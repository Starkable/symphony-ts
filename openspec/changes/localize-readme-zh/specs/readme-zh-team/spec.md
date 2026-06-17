## ADDED Requirements

### Requirement: README 中文叙述

`README.md` 的章节标题与说明性段落 SHALL 使用简体中文撰写，便于团队内部阅读。

#### Scenario: 团队新成员阅读简介

- **WHEN** 团队成员打开 `README.md`
- **THEN** 项目定位、运行步骤、功能说明等叙述性内容 SHALL 为中文

#### Scenario: 技术标识符保持原文

- **WHEN** README 包含 CLI 命令、环境变量、YAML 配置或文件路径
- **THEN** 这些内容 SHALL 保持英文/原文格式以便直接复制执行

### Requirement: 删除 README 脏数据

`README.md` SHALL NOT 包含 License 段之后的无关内容（包括但不限于 `understand-community` YAML 块与 `Order Service` 残留）。

#### Scenario: 文件正常结尾

- **WHEN** 阅读 README 至末尾
- **THEN** 最后有效章节 SHALL 为 License（及上游归属说明），且其后无额外 YAML 或无关标题

### Requirement: README 轻量提及 PMS tracker

`README.md` SHALL 在环境要求、WORKFLOW 说明与 Roadmap 中提及 PMS（`tracker.kind: pms`），并 SHALL 链接至 `docs/pms-tracker.md` 与 `examples/workflow-pms/WORKFLOW.md`。

#### Scenario: 环境要求列出 PMS

- **WHEN** 团队成员查看运行前置条件
- **THEN** README SHALL 说明除 Linear 外亦支持 PMS，并指向 PMS 配置文档

#### Scenario: PMS 细节不在 README 展开

- **WHEN** 团队成员需要 PMS OAuth 或 RSA 配置细节
- **THEN** README SHALL 通过链接引导至 `docs/pms-tracker.md`，而非在 README 内展开完整配置

### Requirement: README 不膨胀实现细节

`README.md` SHALL 保持仓库功能说明与 Quickstart 定位；PMS OAuth 细节、Cursor Policy 全流程、orchestrator 暂缓项 SHALL 继续通过 `docs/` 文档引用。

#### Scenario: 详细配置引用 docs

- **WHEN** README 提及 WORKFLOW 全字段或 PMS 联调
- **THEN** SHALL 链接至 `docs/WORKFLOW.template.md` 或 `docs/pms-tracker.md`，而非复制大段配置说明

### Requirement: upstream README 保持不变

本变更 SHALL NOT 修改 `README.upstream.md`。

#### Scenario: upstream 参考仍存在

- **WHEN** 贡献者需要对齐 upstream 英文说明
- **THEN** `README.upstream.md` SHALL 保持变更前内容
