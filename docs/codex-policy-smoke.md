# Codex Policy 手工 smoke（可选）

依赖：`codex` CLI、已安装的 `symphony-openspec-bundle`（`.agents/skills`）、Linear/PMS 凭据。

1. 复制 `examples/workflow-codex-policy/WORKFLOW.md`，填入 tracker 与仓库 URL。
2. 设置 `SYMPHONY_POLICY_ROOT` 指向 bundle，确认 `install` 后 workspace 有 `.agents/skills/openspec-new-change/SKILL.md`。
3. 启动 Symphony（`harness: codex`）。
4. 放一张 active issue，观察：
   - turn prompt / structured log 含 `## Skill Instructions`
   - Dashboard 阶段随产物推进
5. 六产物完成后 harness 停止（`harness_stop_workflow_done`）。
