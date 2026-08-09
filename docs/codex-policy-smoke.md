# Codex Policy 手工 smoke（可选）

依赖：`codex` CLI、下游已安装的 Policy skills（推荐 `symphony-openspec-bundle`）、Linear/PMS 凭据。

1. 准备 WORKFLOW（含 `workflow.phases` 与 `harness: codex`），填入 tracker 与仓库 URL。
2. 由下游安装 skill（推荐设置 `SYMPHONY_POLICY_ROOT` 并执行 bundle install）；Symphony **不**校验/内联 `SKILL.md`。
3. 启动 Symphony。
4. 放一张 active issue，观察：
   - turn prompt 含 `effective_phase` / `skill` / `produces` 与 Policy，以及「请使用已安装的 skill …」弱引导
   - **不含** Skill 正文内联节
   - Dashboard 阶段随产物推进
5. 六产物完成后 harness 停止（`harness_stop_workflow_done`）。
