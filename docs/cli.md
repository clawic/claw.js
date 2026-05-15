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
claw inspect storage --json
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
claw personalities upsert personality.review --name Reviewer --prompt "Review with concrete evidence" --json
claw skill-collections upsert collection.review --name Review --tags review,code --json
claw connections upsert github --provider custom --label GitHub --secret-ref vault://connections/github --json
```

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
claw content posts list
claw content campaigns list
claw content publications list
claw business --help
claw social --help

claw knowledge search response_style --json
claw knowledge memories search response_style --json
claw profile get --json
claw profile refresh --json
claw profile --help
claw health --help
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
- Top-level namespaces: `data`, `app-state`, `signals`, `memory`, `user`,
  `ops`, `infra`, `workspace-search`, and `workspace-index`.
- Top-level snapshot verbs: `export`, `import`, and `backup`.
- V1 CRUD under `business` and `social`.
- Runtime sidecar verbs: `runtime queue`, `runtime job`, `runtime event`, and
  `runtime retention`.
