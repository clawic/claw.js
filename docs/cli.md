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

## Productivity Commands

The productivity surface is built into the CLI. In any directory, the
commands below autobootstrap a local SQLite store at
`.clawjs/data/productivity.sqlite` without `workspace init` and without
installing `@clawjs/workspace` into the target project.

```bash
claw tasks list
claw tasks create --title "Triage docs drift"
claw tasks complete --id task-123

claw goals list
claw goals create "Ship local-first productivity" --project-id project-123

claw projects list
claw projects create "Workspace Core" --status in_progress

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

claw events list
claw events create --title "Release sync" --starts-at 2026-03-27T09:00:00Z

claw workspace-search query "release" --domains tasks,notes,inbox
claw workspace-index rebuild
```

Use `--json` when you want the raw records back. `workspace-search
query` also accepts `--strategy auto|keyword|semantic|hybrid`,
`--limit`, and `--include-archived`. `reminders list` and
`deadlines list` also accept `--before` and `--after` filters over
their due timestamps.

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

Use `--time-url` or `CLAWJS_TIME_URL` to point the CLI at the standalone
`time/` service. `--time-token` or `CLAWJS_TIME_TOKEN` adds optional
bearer auth when the service is fronted by a gateway.

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

## Database Bridge

```bash
claw database serve --url http://127.0.0.1:4510
claw database login --url http://127.0.0.1:4510 --email admin@database.local --password database-admin
claw database namespace list --url http://127.0.0.1:4510 --token <admin-token>
claw database collection create --namespace main --name leads --fields '[{"name":"name","type":"text","required":true}]' --url http://127.0.0.1:4510 --token <admin-token>
claw database record create --namespace main --collection leads --data '{"name":"Ada"}' --url http://127.0.0.1:4510 --token <admin-token>
claw database token mint --url http://127.0.0.1:4510 --token <admin-token>
claw database file upload --namespace main --collection leads --record rec_123 --file ./avatar.png --url http://127.0.0.1:4510 --token <admin-token>
```

`claw database ...` delegates to the standalone CLI shipped inside the
repo-local `database/` app. Use `--database-dir` or `CLAWJS_DATABASE_DIR`
when the app lives outside the default monorepo path.

## ERP Bridge

```bash
claw erp login --url http://127.0.0.1:4530 --email admin@erp.local --password erp-admin
claw erp tenant bootstrap --name "Acme ERP" --pack es_eu --url http://127.0.0.1:4530 --token <admin-token>
claw erp sales quote-create --tenant tenant_123 --entity entity_123 --branch branch_123 --customer "Ada" --amount 125000 --url http://127.0.0.1:4530 --token <admin-token>
claw erp reports dashboard --tenant tenant_123 --entity entity_123 --url http://127.0.0.1:4530 --token <admin-token>
```

`claw erp ...` delegates to the standalone CLI shipped inside the
repo-local `erp/` app. Use `--erp-dir` or `CLAWJS_ERP_DIR` when the app
lives outside the default monorepo path.

## IoT Bridge

```bash
claw iot homes list --url http://127.0.0.1:4520
claw iot areas list
claw iot things list --kind light
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
