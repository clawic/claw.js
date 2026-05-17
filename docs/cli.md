---
title: CLI
description: Public command reference for the claw CLI.
---

# CLI

`@clawjs/cli` exposes one public binary: `claw`.

```bash
npm install -g @clawjs/cli
claw --help
claw --help --all
claw host --help
```

The public package family also keeps `create-claw-app`, `create-claw-agent`,
`create-claw-server`, and `create-claw-plugin`. It does not expose public
`clawjs` bins.

## Registry And JSON Contract

`claw` is the agent-facing interface to the framework. Public commands,
portals, aliases, support states, security policy, docs, ADRs, tests, and
implementation sources are registered in the ClawJS CLI command registry and
then consumed by help, inspection, search, docs, and tests.

`npm run test:policy` and `npm run test:docs` both run the CLI
registry/router parity guard. The guard fails when a public command loses its
registered docs, ADRs, tests, source symbol, alias uniqueness, router evidence,
or registry-backed help output.

The same gates track pre-V1 raw JSON writer debt. New or expanded raw
`writeJson` CLI responses fail policy; migrations to the common envelope must
lower the tracked debt file count.

New stable JSON responses use:

```json
{ "ok": true, "data": {}, "meta": {} }
```

Errors use:

```json
{ "ok": false, "error": { "code": "...", "message": "..." }, "meta": {} }
```

Pre-V1 raw JSON responses that predate the registry are migration debt. New or
materially changed stable commands must use the envelope and include command
schema/version metadata.

CLI responses can also include compact just-in-time guidance:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "actor": { "actorKind": "agent", "trustSource": "agent-runtime" },
    "guidance": [
      {
        "id": "deployment-runbook",
        "severity": "warning",
        "capsule": "Use the deployment runbook before writing to this server.",
        "reason": "command match",
        "resourceIds": ["res_abc123"],
        "commands": ["claw guidance show deployment-runbook"]
      }
    ]
  }
}
```

`--guidance compact|full|minimal|off` controls how much guidance metadata is
returned. Humans default to minimal guidance; agents and automation default to
compact guidance. Actor hints from flags or environment are treated as
`untrusted`; verified actor assertions require a locally trusted host/runtime
key.

## Project Flow

```bash
claw new app my-app
claw new agent support-agent
claw new server api-server
claw new workspace ops-workspace
claw new skill summarize-ticket
claw new plugin jira-integration

claw generate skill support-triage
claw generate plugin jira-integration
claw generate provider openai
claw generate channel support
claw generate command triage

claw add provider openai
claw add channel support
claw add telegram
claw add scheduler nightly-sync
claw add memory support-memory
claw add workspace default

claw info --json
```

## Agent Discovery

Agents should use `claw` as the project map before treating source files as the
primary source for non-trivial framework questions:

```bash
claw search "database" --json
claw inspect commands --json
claw inspect why database --json
claw inspect database --json
claw inspect schemas --json
claw inspect agent agent.ops --json
claw inspect storage --json
claw inspect command-intents --json
claw inspect dense-data --json
claw inspect dense-intents --json
claw inspect dense-views --json
claw inspect dense-fixtures --json
claw inspect codebase --summary --json
claw inspect codebase --path-prefix packages/clawjs/src/ --symbol runCli --language typescript --tests false --limit 20 --json
```

For data model work, use the local collection catalog and schema commands:

```bash
claw collections list --json
claw collections tasks schema --json
claw db tasks list --json
claw db tasks query "blocked auth" --json
```

The technical `claw database ...` commands administer a running database
service. If no service is running, use `claw collections list --json` for the
agent-facing local catalog instead.

Local agent records are managed through the agent-facing data commands. These
commands write canonical files under `~/.claw/` and project searchable
summaries into the main core database:

```bash
claw agents list --json
claw agents upsert agent.ops --name "Ops Agent" --personalities personality.review --skills deploy --secret-ref vault://agents/ops --json
claw agents schema --json
claw agents evaluate-access --record '{"requested":{"resourceType":"contact","action":"read"},"agentGrants":[],"assignmentGrants":[],"executionProfileGrants":[],"connectorGrants":[],"hostGrants":[],"runScopeGrants":[]}' --json
claw agents delegation-check --record '{"parent":{"requested":{"resourceType":"collection","resourceId":"project_notes","action":"read"},"agentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"assignmentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"executionProfileGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"connectorGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"hostGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"runScopeGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}]},"child":{"requested":{"resourceType":"collection","resourceId":"project_notes","action":"read"},"agentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"assignmentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"executionProfileGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"connectorGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"hostGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"runScopeGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}]}}' --json
claw agents route-check --record '{"assignment":{"id":"assignment.web","agentId":"agent.ops","kind":"external_web_chat","status":"active","channel":"chat"},"kind":"external_web_chat","channel":"chat"}' --json
claw agents resolve-external-identity --record '{"provider":"web","externalId":"visitor-1","email":"visitor@example.com","privacyPolicy":"hashed"}' --json
claw agents project-support-inbox --record '{"sessionId":"session-1","assignment":{"id":"assignment.web","agentId":"agent.ops","kind":"external_web_chat","status":"active","channel":"chat"},"identity":{"externalUserId":"external_user_1","actorId":"actor_external_1","contactProjection":"create_or_update","boundary":{"scopeType":"external_user","scopeId":"external_user_1"},"telemetry":{}},"initialMessage":"Need help"}' --json
claw agents memory-check --record '{"policy":{"readScopes":[{"layer":"global","access":"read"}],"writeScopes":[{"layer":"agent_private","access":"write"}],"writePolicy":"private_only"},"request":{"operation":"write","layer":"agent_private"}}' --json
claw agents budget-check --record '{"policy":{"exceededBehavior":"deny_action","limits":[{"dimension":"external_actions","limit":5,"used":1}]},"request":{"dimension":"external_actions","cost":1,"externalPaidAction":true,"connectorGateAllowed":true}}' --json
claw agents surface-projection --record '{"surface":"relay","agent":{"id":"agent.ops","name":"Ops","secretAllowlist":["vault://agents/ops"]},"assignments":[{"id":"assignment.relay","agentId":"agent.ops","kind":"relay","status":"active","channel":"relay"}],"budgets":[{"id":"budget.relay","exceededBehavior":"deny_action","limits":[{"dimension":"external_actions","limit":10}]}]}' --json
claw agents config-revision --record '{"agentId":"agent.ops","revision":2,"actorId":"actor.owner","reason":"Tighten MCP assignment","configSnapshot":{"name":"Ops","secretAllowlist":["vault://agents/ops"]}}' --json
claw agents incident --record '{"agentId":"agent.ops","assignmentId":"assignment.relay","severity":"high","summary":"Unsafe route blocked","metadata":{"rawTraceRef":"trace:redacted"}}' --json
claw agents activity-feed --record '{"agentId":"agent.ops","runs":[{"id":"run.1","status":"completed","startedAt":"2026-05-17T09:00:00.000Z"}],"incidents":[{"id":"incident.1","severity":"high","summary":"Unsafe route blocked","detectedAt":"2026-05-17T10:00:00.000Z"}],"limit":10}' --json
claw agents blueprint --record '{"name":"Support blueprint","agencyMode":"support","skillBindings":[{"ref":"skill.support","version":"1","requiredResourceGrants":[{"resourceType":"collection","resourceId":"support_conversations","action":"read"}]}],"template":{"role":"Support","secretAllowlist":["vault://agents/ops"]},"requiredResourceGrants":[{"resourceType":"collection","resourceId":"support_conversations","action":"read"}]}' --json
claw agents evaluation --record '{"agentId":"agent.ops","assignmentId":"assignment.relay","status":"failed","score":0.25,"criteria":{"metric":"safety"},"result":{"reason":"Unsafe disclosure"}}' --json
claw agents retirement-plan --record '{"agent":{"id":"agent.ops","name":"Ops","secretAllowlist":["vault://agents/ops"]},"assignments":[{"id":"assignment.relay","agentId":"agent.ops","status":"active"}],"resourceGrants":[{"id":"grant.ops","agentId":"agent.ops","resourceType":"collection","action":"read"}],"reason":"Rotate agent safely"}' --json
claw personalities upsert personality.review --name Reviewer --prompt "Review with concrete evidence" --json
claw skill-collections upsert collection.review --name Review --tags review,code --json
claw connections upsert github --provider custom --label GitHub --secret-ref vault://connections/github --json
claw snippets upsert quickask-review --title "QuickAsk Review" --body "Review the current selection" --kind prompt --json
```

Agents V1 ([ADR 0020](./adr/0020-agents-v1-refactor.md)) treats `agents` as the durable employee/resource composition and
`agent_assignments` as the places where an agent acts: Mac chat, web chat,
Telegram, support inbox, workflow, automation, subagent, MCP/API, Relay, or a
custom channel. New agents start with an empty sandbox. Effective access is the
intersection of agent grants, assignment grants, execution profile sandbox,
connector policy, host policy, and run scope.

External channels must pass `route-check` before runtime dispatch. External
identity resolution creates a stable `external_user`/`actor` boundary, hashes
visitor telemetry by default, and projects to contacts only when there is a
strong identifier such as email, phone, or verified provider id. Assignments
using `raw_with_retention` must set a positive `telemetryRetentionDays`; safe
surface projections report `raw_telemetry_retention_policy_missing` otherwise.
Support-facing assignments use `project-support-inbox` to create the product
conversation record separately from the runtime session trace.
Memory policies are checked with `memory-check`; this is the gate for flexible
read/write combinations such as read-only global memory plus private writes,
team/project/customer scopes, and explicit-grant-only cross-customer access.
Delegation is checked with `delegation-check`; both parent and child must pass
the same effective access intersection, so subagents cannot launder grants
through a weaker parent. Budgets are checked with `budget-check`; external paid
actions require both a budget allowance and connector gate before dispatch.
The SDK exposes the same Agents V1 policy layer through `createClaw().agents`
for multidimensional budgets, redacted audit events, and safe
`claw_agent_package` export. Package
exports redact secret fields and private local paths by construction; raw
secrets remain in the vault and are not included in portable agent config.
Relay, MCP, service API, external channel, and internal UI views use the same
safe surface projection contract so public surfaces only see bounded identity,
assignment, budget, memory, and resource summaries instead of raw prompts,
secret material, local paths, private endpoints, or runtime environment data.
The SDK `agents.serviceApi()` helper wraps the `service_api` projection in a
fail-closed API envelope, returning errors for projection gaps instead of
giving service callers a privileged internal agent view.
The projection fails closed when the assignment kind does not match the target
surface: Relay needs a `relay` assignment, MCP/API and service APIs use
`mcp_api`, internal UI uses `internal_mac_chat`, and external channel views use
external/support/custom channel assignments.
MCP tool calls are double-gated: connector control-plane approval is required,
and the request must also carry an Agents V1 `mcp_api` assignment policy that
passes route and effective-access checks before the MCP protocol is invoked.
`config-revision` and `incident` create redacted, auditable records for
governable agent changes and safety/runtime incidents without exposing raw
secret references, authorization material, local traces, or private paths.
`activity-feed` turns runs, sessions, evaluations, incidents, config revisions,
assignments, and audit events into a redacted timeline for human consumption.
`blueprint` creates redacted reusable templates separate from live agents.
Portable agent packages use `skillBindings` as the canonical skill model:
each binding carries a skill ref, optional version, required assignment kinds,
and required resource grants. The older `skillRefs` input remains a shorthand
that is normalized into bindings for compatibility. `evaluation` records
redacted performance/safety assessments with audit output. `retirement-plan`
produces a recoverable archive plan: the agent is archived, assignments are
revoked, resource grants are expired/denied, and a snapshot ref is recorded
without exposing raw secrets or local paths.

## Global Flags

| Flag | Description |
|----|----|
| `--runtime` | Selects the runtime adapter. |
| `--workspace` | Selects the workspace root. |
| `--app-id`, `--workspace-id`, `--agent-id` | Override workspace identity. |
| `--json` | Returns machine-readable output. |
| `--dry-run` | Prints the plan instead of mutating when supported. |
| `--guidance compact\|full\|minimal\|off` | Controls CLI just-in-time guidance metadata. |
| `--actor-assertion` | Supplies a signed actor assertion for local verification. |
| `--agent-dir`, `--home-dir`, `--config-path`, `--runtime-workspace`, `--auth-store` | Adapter path overrides. |
| `--gateway-url`, `--gateway-token`, `--gateway-port`, `--gateway-config` | Gateway overrides. |
| `--secrets-url`, `--secrets-token`, `--secrets-tenant-id`, `--secrets-sidecar` | Secrets connection overrides. |
| `--template-pack` | Template pack used by `workspace init` or `files apply-template-pack`. |
| `--library-dir` | Overrides the local library root. |

## Report Governance

`claw report` is the agent-facing workflow for safe GitHub reports. It creates
sanitized local drafts, checks evidence quality, finds duplicate candidates,
renders a user approval preview, and builds a connector submission plan.

```bash
claw report bug "CLI crashes when listing reports" --observed "..." --expected "..." --repro "..."
claw report feature "Support a new workflow" --impact "..."
claw report translation "Spanish settings label is wrong" --locale es --observed "..." --expected "..."
claw report security "Private finding" --impact "..."
claw report preview rep_...
claw report submit rep_... --confirm --dry-run
claw report submit rep_... --confirm --execute --host-approval-id approval_... --github-base-url http://127.0.0.1:8787/
claw report github bootstrap --dry-run
claw report export rep_... --redacted --include-attachment trace.txt
claw report prune --older-than 30d --status submitted,blocked --preview
claw report budget status --json
claw report triage --json
```

Reports stay under `.claw/reports/report-governance.json`. The stored content
is redacted, attachments require per-file opt-in, and local salted fingerprints
are used only for dedupe. Low-evidence drafts are blocked with
`NOT_ENOUGH_INFO`. Public security publication is blocked and routed to private
security advisory handling. Real GitHub submission is owned by the Claw GitHub
connector and remains human-approved, using the user's GitHub token via the
secret broker. `submit --dry-run` emits the exact connector operation plan:
issues use `github.action.create-issue`, duplicates use
`github.action.create-issue-comment`, Discussions use
`github.action.create-discussion`, and private security reports use
`github.action.create-security-advisory-report`. PR-looking fixes stay as
proposal-only plans and do not create pull requests from `claw report`.
`submit --execute` is reserved for an approved connector call: it requires a
signed-host approval id, a GitHub token supplied through the brokered secret
field, and a local/test connector endpoint in V1. Real GitHub publication
without that approved connector path remains `EXTERNAL PENDING`.

Before publication, `check` and `submit` can run global dedupe through the Claw
GitHub connector. Strong matches become canonical comments; medium matches block
publication until reviewed. Dedupe does not publish global stable machine IDs:
local salted fingerprints remain local.

`claw report github bootstrap` verifies the repository setup for labels,
templates, `Ideas`/`Feedback` Discussions, and private security routing.
`--apply --confirm` can apply safe supported changes such as missing labels
through the connector; repo settings and manual GitHub capabilities remain
`EXTERNAL PENDING` when they cannot be safely applied from the CLI.

Report retention is manual. `export` emits a redacted package by default and
includes only opted-in attachments named with `--include-attachment`; `delete`
and `prune` require confirmation. Local budgets limit noisy agents by
agent/repo window and duplicate cooldowns; human overrides are audited.

`claw report triage` is the non-destructive automation surface. It may score,
recommend labels, suggest canonical duplicate comments, and build queues, but it
does not close, lock, delete, or publish anything.

## Need Route Lab

`claw needs` is the framework-first lab for turning broad human needs into
composable routes, dry-run evaluations, deduped opportunities, and reviewed
promotion packets. It is deliberately local-first: generation and evaluation do
not call providers, request native permissions, deploy infrastructure, or touch
production data.

```bash
claw needs dimensions --json
claw needs pilots --json
claw needs generate --pilot agent_workflow --limit 4 --json
claw needs generate --pilot agent_workflow --mode llm-lateral --json
claw needs evaluate --pilot iot_home --dry-run --save --json
claw needs opportunities list --json
claw needs opportunities dedupe --json
claw needs opportunities promote route_new_light_control_surface.external_pending_protocol --to report --json
```

V1 models the agreed dimensions as versioned framework data: human intent,
autonomy preference, domain, target surface, agent topology, infrastructure,
data state, permission risk, deliverable, and validation mode. The initial pilot
pack covers agent workflow, app-building/deploy, remote infrastructure, and
IoT/home routes.

Generation is deterministic by default. `--mode llm-lateral` emits a normalized
dry-run expansion plan for lateral scenario work, but V1 does not send prompts
or call model providers from `claw needs`.

Saved evaluations live under `.claw/need-routes/need-route-lab.json`.
Opportunities use the full maturity funnel from `idea` through `shipped`,
`parked`, and `rejected`; kinds distinguish feature, subfeature, bug, refactor,
test, docs, data, surface, validation, security, perf, and research. Scoring is
composite: severity, human scope, frequency, route blocker, constitutional risk,
effort, reuse/leverage, and confidence. Promotion is a draft packet for
`claw report` in V1 and remains approval-gated.

## Command Intents

`claw commands` is the action-vocabulary registry for CLI phrases agents may
try. It resolves arbitrary words to covered commands, candidate aliases, gaps,
future ideas, blocked requests, or external-pending needs without executing
unknown behavior.

```bash
claw commands resolve "house buy" --json
claw commands record --phrase "archive client dashboard" --purpose "Save a client dashboard snapshot for later review" --json
claw commands list --status gap --json
claw commands opportunities --json
claw commands promote cmd_intent_house_buy --to report --json
claw inspect command-intents --json
```

The registry source of truth is versioned TypeScript in `@clawjs/core`. Explicit
workspace records are written only when requested to
`.claw/command-intents/command-intents.json`; `phrase` and `purpose` are
required. Raw local phrases can stay in the ledger, while promotion uses
`claw report` redaction and approval gates.

Unknown command JSON includes `meta.commandIntent`. Human unknown-command output
stays brief and points to `claw commands resolve`. Candidate aliases are
inactive suggestions, not routing changes. `future`, `blocked`, and
`external_pending` entries must describe next steps without producing executable
plans for risky or unavailable actions. See
[ADR 0018: CLI action intent registry](./adr/0018-cli-action-intent-registry.md)
for the durable contract.

## Guidance And Resources

```bash
claw guidance list
claw guidance show deployment-runbook
claw guidance create --title "Deployment runbook" --capsule "Read the runbook before deploys" --command "host services" --resource res_abc123
claw guidance archive deployment-runbook

claw resources register ~/Projects/example --kind project
claw resources show res_abc123
claw resources resolve res_abc123
claw resources read res_abc123
claw resources status res_abc123
```

`guidance` is not `rules`: rules compile into prompt context, while guidance
returns compact hints about instructions that may be expanded on demand.
`resources` stores only explicitly registered resources with opaque `res_*`
ids and mutable locators.

## Host And Database

```bash
claw host list
claw host register local --name "Local Claw" --kind standalone --transport http --address http://127.0.0.1:24102 --use
claw host use local
claw host status
claw host doctor
claw host domains status
claw host domains install --dry-run
claw host services list
claw host permissions list
claw host capabilities list

claw system capabilities list
claw system capabilities grant calendar.read
claw system capabilities revoke calendar.read

claw database serve
claw database login --url http://127.0.0.1:24102
claw database namespace list
claw database collection list
claw database record list
claw database token create
claw database file list

claw collections list
claw collections <collection> schema
claw collections <collection> list

claw db task "Triage docs drift"
claw db <collection> list
claw db <collection> get record-123
claw db <collection> create --set title=Task
claw db <collection> update record-123 --set status=done
claw db <collection> delete record-123
claw db <collection> query "blocked auth"
claw db <collection> schema
claw db tasks list
claw database collection create --namespace main --name leads --fields '[{"name":"title","type":"text"},{"name":"metadata","type":"json"}]'
claw db leads create --set name=Ada --set website=https://ada.dev
claw db leads schema
claw collections <collection> list
claw collections <collection> get record-123
claw collections <collection> schema
claw collections tasks list
claw records <collection> list
claw records <collection> get record-123
claw records <collection> create --set title=Task
claw records <collection> update record-123 --set status=done
claw records <collection> delete record-123
claw records <collection> query "blocked auth"
claw records tasks list
```

`claw db`, `claw collections`, and `claw records` use the canonical
collection catalog for stable local collections. `--set field=value` validates
field names, primitive types, enum values, and relation-id strings before
writing. `schema` returns the same registered field catalog agents should use
for planning writes.

## Work

```bash
claw work agenda --json
claw work review daily --json
claw work export snapshot.json
claw work import snapshot.json --replace
claw work backup backups/

claw projects list
claw tasks list
claw notes list
claw people list
claw goals list
claw inbox list
claw approvals list
claw blockers list
claw decisions list
claw assignments list
claw handoffs list
claw artifacts list
claw commitments list

claw tasks create --title "Triage docs drift"
claw notes record-note "Release note" --body "Draft"
claw notes create --title "Release notes" --content "Draft"
claw people upsert "John Doe"
claw inbox process thread-123 --task-title "Reply"
```

## Time

```bash
claw time list
claw time create event "Release sync" --starts-at 2026-03-27T09:00:00Z
claw calendar list
claw reminders list
claw deadlines list
claw routines every "3h" "check deployment health"
claw schedule after "30m" "check build"
claw watch thread:thread-42 --if-no reply --after 24h --then remind "ping owner"
claw agenda --json
claw timeline week --json
claw review daily --json
```

## Channels

```bash
claw channels status
claw channels list
claw channels telegram connect
claw channels assignments list
claw channels messages sync
claw messages send --channel local --body "hello"
claw messages read --channel local
claw integrations list
claw telegram connect
claw telegram webhook set --url https://example.test/webhook
claw telegram webhook clear
claw telegram polling start
claw telegram polling stop
claw telegram commands set --commands '[{"command":"start","description":"Start"}]'
claw telegram commands get
claw telegram chats list
claw telegram chats inspect 123
claw telegram send --chat-id 123 --text "hello"
claw notify send --title "Build finished" --body "Ready"
claw notify subscriptions upsert --notify-url http://127.0.0.1:24102 --notify-client-token token --json
claw notify subscriptions delete sub-123 --notify-url http://127.0.0.1:24102 --notify-client-token token
```

## Media And Design

```bash
claw media --help
claw documents upload ./brief.md
claw documents read document-123
claw files read README.md
claw files apply-template-pack --template-pack ./template-pack.json
claw images create "product shot"
claw image create "product shot"
claw audio generate --text "hello"
claw video generate --prompt "demo"
claw slides create --title "Roadmap"
claw generations list
claw templates list
claw styles list
claw references list
claw design --help
claw drive --help
claw apps --help
```

## Apps And Profile

```bash
claw content serve
claw content brand list
claw content brand create
claw content destination list
claw content destination create
claw content destination test
claw content campaign list
claw content campaign create
claw content entry list
claw content entry create
claw content entry update
claw content entry attach-asset
claw content entry generate-variants
claw content approval list
claw content approval approve
claw content approval reject
claw content publish plan-list
claw content publish plan-create
claw content publish run
claw content publish cancel
claw content publish runs
claw content publish retry
claw business --help
claw social --help

claw knowledge search response_style --json
claw knowledge memories search response_style --json
claw profile get --json
claw profile refresh --json
claw profile --help
claw health --help
claw health gaps --json
claw patient list --json
claw patient schema --json
claw medication add --patient patient_123 --json
claw patient patient_123 medications list --json
claw patient patient_123 symptoms add "Headache" --severity 4 --json
claw patient patient_123 symptoms list --json
claw company create "Acme Corp" --json
claw account create "Acme Account" --company company_123 --json
claw deal create "Pilot" --company company_123 --account-id account_123 --json
claw invoice list --json
claw invoice create INV-001 --billing-customer billing_customer_123 --total-cents 9900 --json
claw case create "Smith v Jones" --json
claw case case_123 evidence add "Signed contract" --json
claw case case_123 evidence list --json
claw service create API --company company_123 --json
claw incident create Outage --service service_123 --severity sev2 --json
claw service service_123 incidents list --json
claw study create "Trial A" --json
claw study study_123 participants add "Subject 001" --json
claw study study_123 participants list --json
claw sample create "Tube A" --study-id study_123 --json
claw sample sample_123 assays add CBC --json
claw learner create "Ada Learner" --json
claw course create "Intro Biology" --json
claw work-order create "Batch 42" --company company_123 --json
claw financial-account create "Operating Account" --json
claw transaction create Lunch --account financial_account_123 --amount-cents 1200 --json
claw organism create "Mouse A" --species "Mus musculus" --json
claw experiment create "Dose response" --organism organism_123 --json
claw experiment experiment_123 samples add "Exp sample 1" --organism organism_123 --json
claw evidence-source create "Clinic note" --kind document --collection-name patients --record-id patient_123 --json
claw quality-gap create "Missing date of birth" --target-collection patients --target-id patient_123 --gap-kind missing --json
claw semantic-view list --json
claw domain-intent list --json
claw travel --help
claw career --help
claw family --help
claw legal --help
claw finance --help
claw location --help
claw accounts --help
```

## Agent Runtime

```bash
claw sessions list
claw sessions index --workspace ./workspace
claw sessions search "release"
claw sessions generate-title session-123
claw skills list
claw skills sources
claw skills search imagegen
claw skills install imagegen
claw models list
claw models default
claw providers list
claw providers auth-state
claw auth status
```

`runtime` is limited to adapters and setup.

```bash
claw runtime status
claw runtime install
claw runtime uninstall
claw runtime repair
claw runtime setup-workspace
claw workspace repair
```

## Search And Diagnostics

```bash
claw search people
claw search "system capabilities" --json
claw search query "release branch" --json
claw search sources --json
claw search sources enable local.files --profile full --json
claw search query "invoice" --domains files --profile full --file-root ~/Documents --json
claw search sources enable web.ingested --profile full --json
claw search query "release notes" --domains web --profile full --web-root ./web-cache --json
claw search sources enable external.cache --profile full --json
claw search query "provider thread" --domains external --profile full --external-root ./provider-cache --json
claw search status --json
claw search service status --json
claw search service run-once --json
claw search profiles --json
claw search saved list --json
claw search monitors list --json
claw search monitors run monitor-recent --limit 10 --json
claw search actions --json
claw search audit --json
claw search explain "release branch" --json
claw search rebuild --json
claw inspect codebase --json
node scripts/codebase-manifest.mjs --write
(cd ../Clawix/clawix && node scripts/codebase-manifest.mjs --write)
claw inspect codebase --codebase-manifest docs/codebase-manifest.json,../Clawix/clawix/docs/codebase-manifest.json --json
claw inspect connectors --connector-catalog packages/clawjs-integrations/fixtures/started-provider-runtime-catalog.json --json
claw inspect aliases --json
claw inspect why host --json
claw inspect why claw.database.core --json
claw doctor --json
claw diagnostics --help
claw logs --help
claw monitor --help
claw mcp list
claw compat --help
claw browser status
claw browser ensure
claw browser share --url http://127.0.0.1:3000
claw preview share --url http://127.0.0.1:3000
claw open database
claw open index
```

## Advanced

```bash
claw context --help
claw learning --help
claw judgment --help
claw outcomes --help
claw plan create "Polish the home page"
claw code --help
claw rules --help
claw library --help
claw soul --help
claw erp serve
claw iot serve
claw tts synthesize --text "hello"
claw stt transcribe --file voice.wav
claw voice-notes list
claw inference generate-text --prompt "hello"
```

## Removed Public Names

These historical names are intentionally not part of the public CLI:

- Standalone package bins other than `claw`: `memory`, `user`, `delegation`,
  `publishing`, and `clawix-relay`.
- Top-level namespaces: `data`, `app-state`, `memory`, `user`,
  `ops`, `infra`, `workspace-search`, and `workspace-index`.
- Top-level snapshot verbs: `export`, `import`, and `backup`.
- V1 CRUD under `business` and `social`.
- Runtime sidecar verbs: `runtime queue`, `runtime job`, `runtime event`, and
  `runtime retention`.
