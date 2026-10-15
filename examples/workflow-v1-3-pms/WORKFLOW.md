---
tracker:
  kind: pms
  endpoint: http://pms.example.domain
  project_slug: CS
  active_states: ["待评审", "进行中"]
  terminal_states: [Done, Closed]
  oauth:
    access_token: $PMS_OAUTH_ACCESS_TOKEN
    access_token_secret: $PMS_OAUTH_ACCESS_TOKEN_SECRET
    rsa_private_key_path: $PMS_JIRA_KEY_PATH
    consumer_key: qa-monitor

polling:
  interval_ms: 30000

workspace:
  root: $SYMPHONY_WORKSPACE_ROOT

workflow:
  version: "1.3"
  change_ref: kebab_case_issue_id
  phases:
    - id: intake_review
      skill: stage-intake-review
      domain: analysis
      outputs: [review.json]
      gates: [schema_valid]
    - id: discover
      skill: stage-discover
      domain: analysis
      reads_from: [review.json]
      outputs: [discover.json, scope.json]
      gates: [schema_valid]
    - id: spec
      skill: stage-spec
      domain: analysis
      reads_from: [discover.json, scope.json]
      outputs: [spec.json]
      gates: [schema_valid]
    - id: spec_review
      skill: stage-spec-review
      domain: analysis
      reads_from: [discover.json, scope.json, spec.json]
      outputs: [spec_review.json]
      gates: [schema_valid, manual]
    - id: implement
      skill: stage-implement
      domain: implement
      reads_from: [discover.json, scope.json, spec.json]
      outputs: [implement.json]
      gates: [schema_valid]
    - id: verify
      skill: stage-verify
      domain: implement
      reads_from: [spec.json, implement.json]
      outputs: [verify.json]
      gates: [shell]
      shell_command: pnpm test

agent:
  harness: cursor
  max_concurrent_agents: 5
  max_turns: 12
---

<!-- V1.3：无 Prompt 正文；编排与中文 Prompt 由 Symphony 服务内 Composer 生成。 -->
