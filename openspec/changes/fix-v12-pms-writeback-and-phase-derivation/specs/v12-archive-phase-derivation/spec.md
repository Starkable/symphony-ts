## ADDED Requirements

### Requirement: 归档目录产物 fallback

`deriveEffectivePhase`（及共用产物路径解析）SHALL 在 active change 路径 `openspec/changes/{change_ref}/...` 下找不到阶段产物时，回退查找 `openspec/changes/archive/*-{change_ref}/` 下同名相对文件。该 fallback SHALL 适用于 **全部** `workflow.phases` 条目，不仅限于 archive 阶段。

#### Scenario: 归档后 proposal 在 archive 目录

- **WHEN** `openspec/changes/bcs-496/proposal.md` 不存在
- **AND** `openspec/changes/archive/2026-06-21-bcs-496/proposal.md` 存在
- **THEN** clarify 阶段 SHALL 视为完成

#### Scenario: 归档后全阶段 done

- **WHEN** 六阶段产物均仅存在于 `openspec/changes/archive/YYYY-MM-DD-{change_ref}/` 且满足各自完成语义
- **THEN** `deriveEffectivePhase` SHALL 返回 `currentPhase: done` 且 `allComplete: true`

#### Scenario: active 与 archive 均存在时优先 active

- **WHEN** 同一相对路径在 active change 与 archive 目录均存在
- **THEN** SHALL 使用 active change 路径完成判定

### Requirement: archive 目录匹配规则

archive fallback SHALL 匹配目录名以 `-{change_ref}` 结尾的子目录（`change_ref` 为 issue identifier 的 kebab-case）。若存在多个匹配目录，SHALL 选用最近修改的目录（或按目录名日期前缀降序取最新）。

#### Scenario: 多次归档取最新

- **WHEN** 存在 `archive/2026-06-19-bcs-496/` 与 `archive/2026-06-21-bcs-496/`
- **AND** active 路径无产物
- **THEN** SHALL 使用 `2026-06-21-bcs-496` 目录下的产物

## MODIFIED Requirements

### Requirement: 产物扫描推导 effective phase

启用 V1.2 workflow 时，Symphony SHALL 按 `workflow.phases` 顺序扫描各阶段 `produces` 完成状态，第一个未完成的阶段 SHALL 为 `effective_phase`。若全部完成，workflow 状态 SHALL 为 `done`。

产物路径解析 SHALL 同时检查 active change 目录与 `openspec/changes/archive/*-{change_ref}/` 归档目录。

#### Scenario: 首个未完成阶段

- **WHEN** `proposal.md` 存在且 `proposal_review.md` 不存在
- **THEN** effective_phase.id SHALL 为 `proposal_review`

#### Scenario: 全部完成（含仅 archived 产物）

- **WHEN** 六阶段产物均满足完成语义（可在 archive 目录下）
- **THEN** effective_phase SHALL 为 null 或 sentinel `done`

#### Scenario: 归档 mv 后不得回退 clarify

- **WHEN** openspec archive mv 已完成且 archived 目录含完整六阶段 pass 产物
- **THEN** effective_phase SHALL NOT 为 clarify

### Requirement: V1.2 workflow done 时抑制 continuation dispatch

当 V1.2 workflow 启用且 worker 正常退出瞬间产物扫描为 `allComplete === true` 时，orchestrator SHALL NOT 为该 issue schedule continuation retry（`delayType: continuation`）。issue 仍可通过 poll 被重新 dispatch 仅当 PMS state 仍匹配 `active_states` 且本地 workflow 未完成——本 requirement 针对 **同一轮 archive 完成后的立即 continuation**。

#### Scenario: archive 完成后无 Turn N+1 clarify

- **WHEN** Turn N 完成 archive 且 worker 正常退出
- **AND** 产物扫描为 allComplete
- **THEN** orchestrator SHALL NOT 在约 1s 后 dispatch continuation turn 将 effective_phase 误判为 clarify

#### Scenario: 未完成 workflow 仍允许 continuation

- **WHEN** worker 正常退出但产物扫描 allComplete 为 false
- **THEN** orchestrator MAY schedule continuation retry 按现有策略
