---
title: CLI
description: Command reference for the claw CLI across scaffolding, workspace management, and adapter operations.
---

# CLI

The `claw` binary is shipped by `@clawjs/cli`. It is the primary project
entrypoint for ClawJS, while `clawjs` remains as a compatibility alias.
For the side-by-side SDK, CLI, and Relay comparison, use
[Interface Matrix](/interface-matrix).

```bash
npm install -g @clawjs/cli
claw --help
```
## Primary Workflow

```bash
npm install -g @clawjs/cli
claw new app my-app
cd my-app
npm run claw:init

claw generate skill support-triage
claw add telegram
claw info --json
```
The official flow is now `claw new` for project creation,
`claw generate` for internal resources, and `claw add` for integrations.

## Global Flags

| Flag | Description |
|----|----|
| `--runtime` | Selects the runtime adapter. Defaults to `openclaw`. |
| `--workspace` | Selects the workspace root. Defaults to the current working directory. |
| `--app-id`, `--workspace-id`, `--agent-id` | Override workspace identity used to construct the SDK instance. |
| `--json` | Returns machine-readable output. |
| `--dry-run` | Prints command or plan output instead of mutating state when supported. |
| `--agent-dir`, `--home-dir`, `--config-path`, `--runtime-workspace`, `--auth-store` | Adapter path overrides. |
| `--gateway-url`, `--gateway-token`, `--gateway-port`, `--gateway-config` | Gateway overrides passed through to the runtime adapter. |
| `--vault-url`, `--vault-token`, `--vault-tenant-id`, `--vault-sidecar` | Vault connection and compatibility-sidecar overrides for `claw secrets ...`. |
| `--template-pack` | Template-pack path used by `workspace init` or `files apply-template-pack`. |

## Project Commands

```bash
claw new app my-app
claw new agent support-agent
claw new server api-server
claw new workspace ops-workspace
claw new skill summarize-ticket
claw new plugin jira-integration

claw generate provider openai
claw generate channel support
claw add scheduler nightly-sync
claw add memory support-memory
```
Generated repositories include a root `claw.project.json` file. That is
how `generate`, `add`, and `info` know where to write and register
resources.

## Magic Database Workflow

The primary productivity and data workflow is `claw db ...`. In any
directory outside an existing Claw workspace project, it autobootstraps
a local database at `.clawjs/data/database.sqlite` with no schema setup
step and no separate workspace install.

```bash
claw db task "Triage docs drift"
claw db tasks list
claw db leads create --set name=Ada --set website=https://ada.dev
claw db leads schema
claw db leads list --url http://127.0.0.1:4510 --token <token>
```

The CLI auto-normalizes common field synonyms, keeps unknown fields
without failing the write, and auto-creates custom collections on first
write. Use `--json` for raw record envelopes and machine-readable
output.

## Productivity Aliases

The productivity nouns remain available as convenience aliases over the
same CRUD facade for overlapping verbs:

```bash
claw areas create "Personal Ops" --status active
claw areas list

claw tasks list
claw tasks create --title "Triage docs drift"
claw tasks move --ids task-123 --project-id project-123 --goal-id goal-123
claw tasks complete --id task-123

claw goals list
claw goals create "Ship local-first productivity" --project-id project-123

claw projects list
claw projects create "Workspace Core" --status in_progress
claw projects archive project-123 --cascade

claw milestones list
claw milestones create "CLI beta" --project-id project-123 --area-id area-123

claw activity list --task-id task-123

claw blockers list
claw blockers create "Waiting on approval" --kind policy_block --task-id task-123

claw artifacts list
claw artifacts create "Staging screenshot" --kind screenshot --task-id task-123 --summary "Proof of the final state"

claw decisions list
claw decisions create "Keep the loop on /tasks" --status accepted --task-id task-123

claw work-sessions list
claw work-sessions create "Focus shipping" --task-ids task-123 --timebox-minutes 25
claw work-sessions complete work-session-123 --outcome "Closed the loop"
claw assignments create "Reviewer owns release gate" --task-id task-123 --assigned-to-agent-id reviewer
claw handoffs create "Pass release validation" --task-id task-123 --from-agent-id planner --to-agent-id reviewer
claw approvals create "Approve publish" --kind publish --task-id task-123 --policy-reason "Publishing requires sign-off"
claw capacity create "Reviewer capacity" --agent-id reviewer --max-wip 2 --current-wip 1

claw reminders list --before 2026-03-28T00:00:00Z
claw reminders create "Follow up" --trigger-at 2026-03-27T09:00:00Z --anchor-type task --anchor-id task-123

claw deadlines list --after 2026-03-27T00:00:00Z
claw deadlines create "Launch date" --due-at 2026-03-30T18:00:00Z --anchor-type project --anchor-id project-123

claw notes list
claw notes create --title "Release notes" --content "Draft"

claw people list
claw people upsert "John Doe"

claw inbox list
claw inbox read --id thread-123
claw inbox draft --channel email --content "Thanks"
claw inbox archive --id thread-123
claw inbox process thread-123 --task-title "Reply" --note-title "Summary"

claw events list
claw events create --title "Release sync" --starts-at 2026-03-27T09:00:00Z

claw my-work --json
claw team-work --json
claw agenda --json
claw review daily --json
claw export snapshot.json
claw import snapshot.json --replace
claw backup backups/

claw workspace-search query "release" --domains tasks,notes,inbox
claw workspace-index rebuild
```

For overlapping CRUD verbs, `claw tasks ...`, `claw notes ...`,
`claw people ...`, `claw projects ...`, `claw goals ...`,
`claw reminders ...`, `claw deadlines ...`, and `claw events ...`
follow the same local-first behavior and record normalization as
`claw db <collection> ...`. `workspace-search query` also accepts
`--strategy auto|keyword|semantic|hybrid`,
`--limit`, and `--include-archived`. `my-work` returns the current
single-agent operating view, including triage threads, ready work,
blockers, pending decisions, the active focus session, and recent
artifacts. `team-work` returns the coordination view across assignments,
handoffs, approvals, and capacity. `reminders list` and `deadlines
list` also accept `--before` and `--after` filters over their due
timestamps.

## Time Commands

```bash
claw time list --time-url http://127.0.0.1:4730
claw time create event "Release sync" --starts-at 2026-03-27T09:00:00Z --time-url http://127.0.0.1:4730
claw time executions --time-url http://127.0.0.1:4730
claw time calendar --time-url http://127.0.0.1:4730

claw schedule at "monday 9am" "review PRs" --time-url http://127.0.0.1:4730
claw schedule every "3h" "check deployment health" --time-url http://127.0.0.1:4730
claw schedule after "24h if no reply" "follow up" --anchor-type thread --anchor-id thread-42 --time-url http://127.0.0.1:4730
```

By default, `claw time ...`, `claw schedule ...`, `claw reminders ...`,
`claw deadlines ...`, and `claw events ...` use the embedded local
temporal engine. Use `--time-url` or `CLAWJS_TIME_URL` only when you
want to point the CLI at the standalone `time/` service instead.
`--time-token` or `CLAWJS_TIME_TOKEN` adds optional bearer auth when
that service is fronted by a gateway.

## Secrets Commands

```bash
claw secrets list --vault-url http://127.0.0.1:4610 --vault-token <token> --vault-tenant-id demo-tenant
claw secrets describe revenuecat_admin --json
claw secrets types --search revenuecat
claw secrets capabilities revenuecat_admin
claw secrets broker http --method GET --url https://api.revenuecat.com/v2/projects --header "Authorization: Bearer {{revenuecat_admin}}"
claw secrets leases list
```

Use `--vault-url`, `--vault-token`, and `--vault-tenant-id` or the
matching `VAULT_BASE_URL`, `VAULT_TOKEN`, and `VAULT_TENANT_ID`
environment variables to make Vault the active backend. When those
settings are present, `claw.secrets` and `claw secrets ...` default to
Vault instead of the legacy local proxy. Add `--vault-sidecar` or
`CLAWJS_VAULT_SIDECAR_PATH` when you need proxy-compatible sidecar flows
such as `{{secretName}}` injection or lease-backed process/browser
execution.

## Advanced Runtime Commands

```bash
claw --runtime openclaw runtime status
claw --runtime openclaw runtime install
claw --runtime openclaw runtime uninstall
claw --runtime openclaw runtime repair
claw --runtime openclaw runtime setup-workspace
```
Use `--dry-run` with `install`, `uninstall`, `repair`, and
`setup-workspace` to print the planned command and progress plan without
executing it.

## Compatibility Wrappers

The `create-claw-app`, `create-claw-agent`, `create-claw-server`, and
`create-claw-plugin` packages still exist, but they are compatibility
wrappers around the same scaffolding engine used by `claw new`.

## Compat and Diagnostics

```bash
claw --runtime openclaw compat
claw --runtime openclaw compat --refresh
claw --runtime openclaw doctor
```
`compat --refresh` updates the persisted runtime snapshot and state
files. `doctor` returns a combined runtime/workspace/managed-block
report.

## Database Commands

`claw db ...` is the high-level, local-first database surface:

```bash
claw db task "Ship CLI"
claw db tasks list
claw db leads create --set name=Ada --set website=https://ada.dev
claw db leads update rec_123 --set status=qualified
claw db leads get rec_123
claw db leads delete rec_123
claw db leads schema
```

Use `--namespace main`, `--url`, and `--token` when you want the same
surface against a remote database service instead of the local store.

## Database Bridge

```bash
claw database serve
claw database login --url http://127.0.0.1:4510 --email admin@database.local --password database-admin
claw database namespace list --url http://127.0.0.1:4510 --token <admin-token>
claw database collection create --namespace main --name leads --fields '[{"name":"name","type":"text","required":true}]' --url http://127.0.0.1:4510 --token <admin-token>
claw database record create --namespace main --collection leads --data '{"name":"Ada"}' --url http://127.0.0.1:4510 --token <admin-token>
claw database token create --url http://127.0.0.1:4510 --token <admin-token>
claw database file upload --namespace main --collection leads --record rec_123 --file ./avatar.png --url http://127.0.0.1:4510 --token <admin-token>
```

`claw database ...` is the low-level admin/operator surface for serving
the database service, schema management, tokens, records, and files. Use
`claw db ...` for the normal local-first CRUD workflow. Use
`--database-dir` or `CLAWJS_DATABASE_DIR` only when you want to point
the bridge at a custom standalone app checkout during development.

The URL and seeded credentials above are disposable local-development
defaults. Do not reuse them for a shared or production service.

## Content Bridge

```bash
claw content serve
claw content login --url http://127.0.0.1:4650 --email admin@content.local --password content-admin
claw content brand list --url http://127.0.0.1:4650 --token <admin-token>
claw content destination list --url http://127.0.0.1:4650 --token <admin-token>
claw content campaign list --url http://127.0.0.1:4650 --token <admin-token>
claw content entry list --url http://127.0.0.1:4650 --token <admin-token>
claw content variant list --url http://127.0.0.1:4650 --token <admin-token>
claw content approval list --url http://127.0.0.1:4650 --token <admin-token>
claw content publish plans --url http://127.0.0.1:4650 --token <admin-token>
claw content token issue --url http://127.0.0.1:4650 --token <admin-token>
```

`claw content ...` delegates to the standalone content-service CLI. Use
it for CMS and social-publishing administration: brands, destinations,
campaigns, entries, variants, approvals, publish plans, publication
runs, and scoped tokens. The local URL and seeded account are only for
disposable development data.

## Notify Bridge

```bash
claw notify send --notify-url http://127.0.0.1:4610 --notify-source-token <source-token> --context-json '{"tenantId":"demo"}' --delivery-json '{"mode":"alert","title":"hello"}'
claw notify cancel <notification-id> --notify-url http://127.0.0.1:4610 --notify-source-token <source-token>
claw notify subscriptions upsert --notify-url http://127.0.0.1:4610 --notify-client-token <client-token> --source-app-id ops-center --agent-id deployer
claw notify subscriptions delete <subscription-id> --notify-url http://127.0.0.1:4610 --notify-client-token <client-token>
```

Use source tokens for emitting or canceling notifications. Use client
tokens for user-facing subscription changes. Keep these examples on a
local Notify service unless you have explicitly configured real source
and client credentials.

## ERP Bridge

```bash
claw erp serve
claw erp login --url http://127.0.0.1:4530 --email admin@erp.local --password erp-admin
claw erp tenant bootstrap --name "Acme ERP" --pack es_eu --url http://127.0.0.1:4530 --token <admin-token>
claw erp company list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp localization status --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp gl account-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp ar invoice-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp ap bill-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp sales quote-create --tenant tenant_123 --entity entity_123 --branch branch_123 --customer "Ada" --amount 125000 --url http://127.0.0.1:4530 --token <admin-token>
claw erp purchase order-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp inventory stock-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp mrp plan-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp projects list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp hr employee-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp payroll run-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp support ticket-list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp docs list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp reports dashboard --tenant tenant_123 --entity entity_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp agents list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
claw erp approvals list --tenant tenant_123 --url http://127.0.0.1:4530 --token <admin-token>
```

`claw erp ...` delegates to the standalone CLI shipped inside the
repo-local `erp/` app. Use `--erp-dir` or `CLAWJS_ERP_DIR` when the app
lives outside the default monorepo path.

## IoT Bridge

```bash
claw iot serve
claw iot homes list --url http://127.0.0.1:4520
claw iot areas list
claw iot things list --kind light
claw iot state get
claw iot lights off office
claw iot climate set thermostat --temperature 21
claw iot scenes activate scene_good_night
claw iot automations run automation_bedtime
claw iot approvals list
claw iot raw invoke --connector home-assistant --target light.office_main --action turn_on --payload '{"brightness":80}'
```

`claw iot ...` delegates to the standalone CLI shipped inside the
repo-local `iot/` app. Use `--iot-dir` or `CLAWJS_IOT_DIR` when the app
lives outside the default monorepo path.

## Shared Browser Bridge

```bash
claw browser status --relay-url http://127.0.0.1:4410 --access-token <access-token> --tenant-id demo-tenant --agent-id demo-agent --workspace-id main
claw browser ensure --relay-url http://127.0.0.1:4410 --access-token <access-token> --tenant-id demo-tenant --agent-id demo-agent --workspace-id main --url https://example.org
claw browser share --relay-url http://127.0.0.1:4410 --access-token <access-token> --tenant-id demo-tenant --agent-id demo-agent --workspace-id main
```

The browser bridge calls Relay workspace browser-session routes. Use it
only after a relay connector is online for the target workspace.

## Workspace Commands

```bash
claw workspace init
claw workspace attach
claw workspace inspect
claw workspace discover
claw workspace validate
claw workspace reset
claw workspace repair
```
| Command | Key flags |
|----|----|
| `workspace init` | `--workspace`, `--app-id`, `--workspace-id`, `--agent-id`, optional `--template-pack` |
| `workspace discover` | `--root`, `--max-depth` |
| `workspace reset` | `--remove-manifest`, `--remove-compat`, `--remove-bindings`, `--remove-state`, `--remove-sessions`, `--remove-audit`, `--remove-backups`, `--remove-locks`, `--remove-runtime-files` |

## Files Commands

```bash
claw files read --file SOUL.md
claw files write --file SOUL.md --value "new content"
claw files inspect --file SOUL.md
claw files diff --file SOUL.md --block-id tone --key tone --value direct
claw files sync --file SOUL.md --block-id tone --key tone --value direct
claw files apply-template-pack --template-pack ./pack.json
```
`files diff` and `files sync` are binding-oriented helpers. They
construct a `managed_block` binding from `--file`, `--block-id`,
`--key`, and `--value`.

## Auth and Models

```bash
claw auth status
claw auth login --provider openai
claw auth remove --provider openai

claw models list
claw models default
claw models set-default --model openai/gpt-4.1

claw providers list
claw providers catalog
claw providers auth-state
```
`auth login` supports `--set-default=false`. `models set-default`
supports `--dry-run` and prints the adapter-specific command that would
be executed.

## Scheduler, Memory, Skills, and Channels

```bash
claw scheduler list
claw scheduler run --id morning-sync
claw scheduler enable --id morning-sync
claw scheduler disable --id morning-sync

claw time list
claw time get item_123
claw time create routine "Review PRs" --cron "0 */3 * * *"
claw time pause item_123
claw time resume item_123
claw time run item_123
claw time executions --item-id item_123
claw time calendar
claw time timeline

claw schedule at "monday 9am" "review PRs"
claw schedule every "3h" "check deployment health"
claw schedule after "24h if no reply" "follow up"

claw memory list
claw memory status
claw memory inspect
claw memory search --query incident

claw skills list
claw skills inspect
claw skills sync
claw skills sources
claw skills search --query support
claw skills install support-triage --source clawhub

claw channels list
claw channels status
```
## Telegram

```bash
claw telegram connect --secret-name my_bot_token
claw telegram status
claw telegram webhook set --url https://example.com/telegram
claw telegram webhook clear
claw telegram polling start
claw telegram polling stop
claw telegram commands set --commands '[{"command":"help","description":"Show help"}]'
claw telegram commands get
claw telegram chats list
claw telegram chats inspect --chat-id 123
claw telegram send --chat-id 123 --text "hello"
```
| Command | Key flags |
|----|----|
| `telegram connect` | `--secret-name`, optional `--api-base-url`, `--webhook-url`, `--webhook-secret-token`, `--allowed-updates`, `--drop-pending-updates` |
| `telegram webhook set` | `--url` or `--webhook-url`, optional `--webhook-secret-token`, `--allowed-updates`, `--drop-pending-updates`, `--max-connections`, `--ip-address` |
| `telegram polling start` | optional `--limit`, `--timeout`, `--allowed-updates`, `--drop-pending-updates` |
| `telegram commands set` | `--commands` JSON array of `{ command, description }` |
| `telegram chats inspect` | `--chat-id` |
| `telegram send` | `--chat-id` and either `--text` or `--media`. Optional `--type`, `--caption`, `--parse-mode`, `--reply-to-message-id`, `--message-thread-id` |

## Sessions

```bash
claw sessions create --title "Repo tour"
claw sessions list
claw sessions read --session-id clawjs-123
claw sessions generate-title --session-id clawjs-123
claw sessions stream --session-id clawjs-123
claw sessions stream --session-id clawjs-123 --events
```
`sessions stream` supports `--transport`, `--system-prompt`,
`--context`, `--chunk-size`, and `--gateway-retries`. With `--events`,
the command emits the structured event stream used by the SDK.

## Documents

```bash
claw documents list
claw documents read --document-id doc_123
claw documents search --query budget
claw documents upload --file ./brief.txt
claw documents register --file ./existing.pdf
claw documents download --document-id doc_123 --out ./brief.txt
```
Use `upload` when the CLI should ingest file bytes into the workspace
document store. Use `register` when the file already exists on disk and
should be indexed in place.

## Inference and TTS

```bash
claw inference generate-text --prompt "Summarize the repo"
claw inference generate-text --messages-json '[{"role":"user","content":"Explain the runtime layout"}]'

claw tts providers
claw tts catalog
claw tts config
claw tts set-config --config-json '{"provider":"openai","enabled":true,"voice":"nova"}'
claw tts synthesize --text "Hello world" --provider openai --api-key sk-test --out ./speech.mp3
```
`inference generate-text` accepts `--prompt`, `--message`, `--text`, or
`--messages-json`, plus the same `--transport`, `--system-prompt`,
`--context`, `--model`, `--chunk-size`, and `--gateway-retries` knobs as
the SDK.

## SDK-Only And Relay-Only Areas

The CLI mirrors a large subset of the local SDK surface, but not all of
it. The Relay mirrors a different remote-safe subset again. Use
[Interface Matrix](/interface-matrix) when you need the exact
cross-surface comparison.

## Media And Generations

```bash
claw generations backends
claw generations register-command --id local-imagen --command node --kinds image --args-json '["scripts/generate-image.mjs"]'
claw generations create --kind image --prompt "Minimal line-art cat"
claw generations list --kind image
claw generations read --id gen_123
claw generations delete --id gen_123

claw image backends
claw image generate --prompt "Minimal line-art cat"
claw image list

claw audio generate --prompt "Read the release summary aloud" --voice nova
claw video generate --prompt "Animate the dashboard hero"
```

The typed `image`, `audio`, and `video` groups are convenience facades
over the generic generation store. `generate` also accepts `--backend`,
`--model`, `--title`, `--metadata-json`, `--command`, `--args-json`,
`--cwd`, `--env-json`, `--ext`, and `--mime-type`.

## SDK-Only Namespaces

Some public SDK surfaces do not have first-class CLI commands yet:

- `claw.runtime.plugins`
- `claw.slack`
- `claw.whatsapp`
- `claw.watch`

Use the Node API for those flows today.

## Exit Codes

| Code | Meaning                                |
|------|----------------------------------------|
| `0`  | Command completed successfully.        |
| `1`  | Command failed.                        |
| `2`  | Command completed in a degraded state. |
| `64` | Invalid usage.                         |
