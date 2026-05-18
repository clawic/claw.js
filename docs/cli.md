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

## Evolution

`claw evolution` is the agent-facing operator surface for public surface
evolution, migration planning, rescue diagnostics, redacted receipts, and
repair packets.

```bash
claw evolution list --json
claw evolution show policy --json
claw evolution diff --json
claw evolution verify --json
claw evolution repair --json
```

Risky actions such as apply, repair, rollback, backup creation, report sharing,
external source access, deletion, movement, or large-state overrides are
approval-gated. The command keeps its first slice plan-first: it classifies
state, verifies the ledger, and returns redacted repair context before any
future mutating implementation is allowed.

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

## Mac Control Plane

Local macOS control is a first-class CLI surface governed by the [Mac Control
Plane](./mac-control-plane.md), [ADR 0023](./adr/0023-mac-control-plane-v1.md),
and [ADR 0024](./adr/0024-mac-permission-broker-v1.md). Everyday commands use
direct roots such as `claw wifi`, `claw window`, `claw shortcut`, `claw app`,
`claw bluetooth`, and `claw vpn`; users and agents should not need an ordinary
`mac` prefix to act on the current Mac. `claw mac` is the control-plane portal
for atlas, coverage, doctor, audit, planning, permission overview, and revert.
`claw permissions` is the central root for OS permission state and framework
grants. The signed host keeps permission lifecycle evidence in
`mac-permission-lifecycle.json`, including `requestedBefore`,
`lastRequestedAt`, `lastCheckedAt`, and `revocationDetectedAt`.
Granular Mac Control policy grants are persisted by the signed host in
`mac-control-policy-grants.json`; host-side policy edits support `list`,
`upsert`, and `revoke` for role, user, agent, assignment, run, MCP client, and
automation subjects.
Connectivity-changing Wi-Fi actions persist broker-owned continuity snapshots
in `mac-control-continuity.json`; `claw mac revert macact_...` remains
plan-first and signed-host execution requires explicit confirmation.
Permission requests are also plan-first: signed-host
`system mac permissions --command request --permission-id mac.permission...`
returns `confirmation_required` unless `--confirm true` is supplied, then
records `lastRequestedAt` and `lastRequestResult` in the lifecycle file.

The Mac Control Plane is plan-first and signed-host brokered. CLI surfaces may
be visible while a family is atlas-only; they report coverage, gaps, or dry-run
plans until execution is complete. Sensitive native calls, TCC permission
requests, receipts, rollback, and audit belong behind the Mac Action Broker and
Mac Permission Broker.
When `CLAW_LIVE_BROKER_COMMAND` points at the active signed host, direct roots
such as `claw wifi connect`, `claw window close`, and `claw shortcut run` hand
off executable requests to `system mac execute`; `claw mac audit`, `claw mac
revert`, and `claw permissions request` use the same signed-host bridge.
Without that bridge, these commands fail closed with a plan or
`signed_host_required`.

Commands with semantic collisions show `Related surfaces` in normal help. For
example, `claw app --help` points to the `apps` catalog, `notification` points
to `notify`, `audio` points to Mac system-audio coverage, `calendar`,
`contacts`, `reminders`, `files`, and `location` point to central
`permissions`, and `stt`/`tts`/`voice-notes` point back to Mac speech and
microphone control.

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
claw inspect governance --json
claw inspect database --json
claw inspect schemas --json
claw inspect agent agent.ops --json
claw inspect storage --json
claw inspect command-intents --json
claw inspect dense-data --json
claw inspect dense-gaps --json
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

## Remote Gateway And Sync

Remote access uses the Coordinator/Gateway/Connector/Sync architecture from
ADR 0022. These commands are the public inspection, dry-run, and opt-in local
state surface for remote parity, node trust, sync manifests, and
hosted/self-hosted conformance:

```bash
claw remote classify --json
claw remote classify --capability-id claw.gateway --classification remote-safe --route-id remote.chatGateway --policy-ref docs/adr/0022-remote-gateway-sync-redesign.md --test-refs packages/clawjs/src/inspect-cli.test.ts --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw remote check --json
claw remote routes --json
claw remote conformance --json
claw remote offline-command --route-id remote.chatGateway --reason connector_offline --json
claw remote pending --json
claw remote validation-checklist --json
claw remote validation-template --json
claw remote validation-artifact --json
claw remote validation-runbook --json
claw remote validation-readiness --source-qa-review-file docs/remote-gateway-sync-source-qa-review.json --external-validation-file docs/remote-gateway-sync-external-validation-evidence.json --json
claw remote validation-report --json
claw remote source-qa-template --json
claw remote closure-gate --source-qa-review-file docs/remote-gateway-sync-source-qa-review.json --external-validation-file docs/remote-gateway-sync-external-validation-evidence.json --json
claw remote contracts --json
claw remote e2e-plan --json
claw remote compat --legacy-surface relay.mobile.chat --canonical-route remote.chatGateway --client-kind ios --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw inspect remote --json

claw sync drivers --json
claw sync manifest --resource-id skills:default --kind skills --driver skills --json
claw sync status --json
claw sync plan --json
claw sync plan --resource-id skills:default --driver skills --local-hash hash-a --peer-hash hash-b --json
claw sync plan --local-snapshot-json '{"resourceId":"skills:default","objectRef":"skill.review","nodeId":"local","contentHash":"hash-a","updatedAt":"2026-05-17T09:00:00.000Z"}' --peer-snapshot-json '{"resourceId":"skills:default","objectRef":"skill.review","nodeId":"peer","contentHash":"hash-b","updatedAt":"2026-05-17T09:05:00.000Z"}' --json
claw sync run --json
claw sync manifest --resource-id skills:default --driver skills --state-dir .claw/remote-sync --record true --json
claw sync run --resource-id skills:default --driver skills --peer-snapshot-json '[]' --state-dir .claw/remote-sync --queue true --json
claw sync reconcile --resource-id skills:default --driver skills --state-dir .claw/remote-sync --ack-change-ids sync_change_... --json
claw sync apply --resource-id skills:default --driver skills --state-dir .claw/remote-sync --ack-change-ids sync_change_... --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw sync handoff --resource-id skills:default --driver skills --to-node node.server --requested-authority primary --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw sync manifest --resource-id skills:default --driver skills --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw sync conflicts --json
claw sync cache --resource-id skills:default --driver skills --object-ref skill.review --client-id iphone.local --content-hash hash-cache --ttl-seconds 600 --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json

claw nodes list --json
claw nodes pair --dry-run --json
claw nodes trust --dry-run --json
claw nodes trust --target-node vps.server --owner-node mac.home --coordinator-node coord.home --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw nodes revoke --dry-run --json
claw nodes invite --issuer-mesh mesh.home --recipient-mesh mesh.server --allowed-resources skills:default --actions read,sync --json
claw nodes accept --issuer-mesh mesh.home --recipient-mesh mesh.server --allowed-resources skills:default --actions read,sync --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw nodes share --issuer-mesh mesh.home --to-mesh mesh.server --resource-id skills:default --driver skills --actions read,sync --json
claw nodes revoke --target-type share --target-id mesh_share_1 --json
claw nodes invite --issuer-mesh mesh.home --recipient-mesh mesh.server --allowed-resources skills:default --actions read,sync --state-dir .claw/remote-sync --record true --json
claw nodes share --issuer-mesh mesh.home --to-mesh mesh.server --resource-id skills:default --driver skills --actions read,sync --state-dir .claw/remote-sync --record true --json
claw nodes revoke --target-type share --target-id mesh_share_1 --state-dir .claw/remote-sync --record true --json
claw nodes heartbeat --json
claw nodes heartbeat --transport iroh --owner-node mac.home --peer-node vps.server --coordinator-node coord.home --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json

claw gateway serve --dry-run --json
claw gateway serve --state-dir .claw/remote-sync --record true --gateway-node gateway.self --coordinator-node coord.home --bind-address 127.0.0.1:24102 --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw gateway project --dry-run --json
claw gateway project --state-dir .claw/remote-sync --record true --gateway-node gateway.hosted --coordinator-node coord.home --public-base-url https://gateway.example.test --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw gateway conformance --json
claw gateway agent-service --tenant-id tenant.acme --agent-id agent.support --assignment-id assignment.service --estimated-cost-cents 300 --json
claw gateway agent-service --tenant-id tenant.acme --agent-id agent.support --assignment-id assignment.service --estimated-cost-cents 300 --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw gateway audit --route-id remote.chatGateway --resource-type session --resource-id session.demo --action read --actor-kind human --actor-id user.remote --state-dir .claw/remote-sync --record true --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw gateway secret-lease --state-dir .claw/remote-sync --secret-ref vault://agents/support --resource-id skills:default --agent-id agent.support --assignment-id assignment.service --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
claw gateway secret-provider --state-dir .claw/remote-sync --secret-ref vault://agents/support --resource-id skills:default --provider-id provider.1password --credential-binding-id credential.support --agent-id agent.support --assignment-id assignment.service --coordinator-private-key-file .claw/coordinator/private.pem --coordinator-public-key-file .claw/coordinator/public.pem --json
```

`remote-safe` means the capability has a route, owner, policy, and tests.
`local-only`, `blocked`, and `pending` are explicit states, not silent gaps.
`remote classify --capability-id ... --record true` records a signed
`RemoteSurfaceClassificationReceipt`; a `remote-safe` receipt requires a route
id, policy reference, and test evidence before anything is written.
`remote pending` returns the no-write `RemoteExternalPendingRegister`: the
single audit list of hardware, provider, hosted rollout, client storage,
runtime, billing, and end-to-end validations that cannot be claimed complete
until explicitly run.
`remote validation-checklist` returns the no-write external validation
checklist: one command, artifact set, and acceptance-criteria set for every
`RemoteExternalPendingRegister` row, so `EXTERNAL PENDING` has explicit proof
requirements before any row can clear.
`remote validation-template` returns the matching no-write evidence JSON
template. Operators fill its `evidence` array only after approved
physical/provider runs, including an `approvedRunRef` approval/audit reference
for each row, then submit the full artifact to `remote validation-report`.
Raw evidence arrays are report-only and remain non-clearable. The
`remote validation-artifact` command returns the matching versioned pending
artifact shape with source conversation/plan metadata and approval request
binding. The checked-in pending artifact is
`docs/remote-gateway-sync-external-validation-evidence.json`; it intentionally
contains unapproved no-write rows and can be submitted with
`--evidence-file docs/remote-gateway-sync-external-validation-evidence.json`
or the alias `--external-validation-file`.
`remote validation-runbook` returns the no-write operator bundle for the final
external validation: the provider/device E2E plan, checklist, evidence artifact,
report command, closure-gate command, required commands, and step-by-step
instructions in one payload.
`remote validation-readiness` checks that the source Q/A artifact, external
evidence artifact, checklist, runbook, E2E plan, and closure gate are all ready
before an approved physical/provider validation run. With the current checked-in
artifacts it returns `ready_for_approved_run`: source review is complete, the
evidence artifact has one clean pending row per external requirement, and only
`external_validation` remains blocked. It is no-write and does not approve the
physical/provider run by itself. Partially approved evidence, for example rows
missing `approvedRunRef`, is `not_ready`; after a real approved run the same
gate advances only when the evidence is fully clearable.
`remote validation-approval-request` returns the no-write approval packet for
that real run. It includes the source-bound conversation/plan IDs, readiness
status, all 13 requirement IDs, required E2E domains, required topology
targets, required route contract IDs, commands to run, approval scope, and
prohibited actions. It always reports `approvalRequired: true` and
`approved: false` with status `approval_required`; it is a request for explicit
approval, not approval itself.
`remote validation-report` evaluates supplied external evidence, if any, against
that checklist. With no approved physical evidence it stays `external_pending`;
external validation is artifact-only clearable, so raw evidence rows may be
counted for reporting but cannot clear. Only rows inside a source-bound and
approval-request-bound `RemoteExternalValidationEvidenceArtifact` with
`approvedRun: true`, an `approvedRunRef`, physical evidence, all required
artifacts, all acceptance criteria, and no plaintext material become
`clearable`. Unknown or duplicate evidence requirement IDs are fail-closed and
reported through `invalidEvidenceRequirementIds` and
`duplicateEvidenceRequirementIds`; they never silently clear the report. When
files use the versioned artifact shape, the source conversation, plan, and
approval request IDs must match this goal before the rows are accepted.
`remote source-qa-template` returns the no-write source Q/A review template for
the original Relay/Gateway/Coordinator/Connector/Sync source conversation and
plan. It is intentionally incomplete: every row must be reviewed one by one and
converted into a `RemoteSourceQaReviewItem` with disposition, evidence refs,
review timestamp, and `writes: false` before submission to `remote closure-gate`.
The template exposes `externalPendingRequiredSourceQaIds` so operators can see
the exact source Q/A rows tied to physical/provider requirements in
`RemoteExternalPendingRegister`; those rows must use `external_pending`
disposition until those requirements are cleared;
the report exposes duplicate rows as `duplicateSourceQaIds` and disposition
mismatches as `invalidExternalPendingDispositionQaIds`. The closure command can
consume either `--source-qa-review-json` or a versioned artifact with
`--source-qa-review-file docs/remote-gateway-sync-source-qa-review.json`; if
the file is an object with an `items` array, those items are submitted as the
review rows. Versioned source Q/A artifacts are source-bound too and are
rejected when their conversation or plan IDs do not match this goal.
`remote closure-gate` combines the external validation report with the required
source Q/A review report. It remains `blocked` until all 23 source Q/A rows
have a disposition, evidence refs, and every external validation row is
`clearable`. The closure command can consume the same external validation
artifact through `--evidence-file` or `--external-validation-file`; the current
pending artifact keeps only the `external_validation` blocker after the source
Q/A review file has cleared `source_qa_review`. Supplying raw external evidence
rows is not enough to clear the external validation blocker.
The final provider/device end-to-end row is not a loose note: it is backed by
`RemoteProviderDeviceE2EValidationPlan`, which requires chat, search, Sync,
secret-reference, and hosted-agent validation to pass together against the same
remote contracts and pending register before `provider_device_e2e` can clear.
`remote contracts` returns the no-write remote route contract catalog. Each
required Gateway/Connector/Sync/Mesh route is bound to local CLI/service
contract refs and remote entrypoints, requires parity, and keeps
`parallelApiAllowed: false` so remote clients do not grow a parallel API.
`remote e2e-plan` returns the same no-write
`RemoteProviderDeviceE2EValidationPlan` for operators and agents that need the
final provider/device checklist without calling Relay directly. Its
`validationSteps` split the final run into `chat`, `search`, `sync`,
`secret_refs`, and `hosted_agents`, and each step binds required routes,
external pending blockers, artifacts, and acceptance criteria.
The plan also names required topology targets: Mac host, Linux host, Windows
host, headless server, VPS host, mobile client, browser client, self-hosted
Gateway, and hosted Gateway.
`inspect remote` is the read-only inspection view that puts remote
classification, Sync authority/drivers, transport, route contracts, tests,
gaps, and conformance in one JSON payload.
`remote offline-command` returns the no-write `RemoteOfflineCommandResult` for
interactive remote calls when a Connector, node, or transport is unavailable.
It always reports `failed_fast`, `enqueued: false`, `retryable: true`, and
`writes: false`, so command execution cannot silently turn into Sync queue
work.
`--state-dir` records manifests, sync queues, reconciliation results, and
mesh proposals/revocations in a local durable ledger. That ledger is not trust
authority unless each record is signed with Coordinator keys. The
`--coordinator-private-key-file` and `--coordinator-public-key-file` flags add
an Ed25519 signature that `claw sync status --state-dir ...` verifies and
counts. Pairing, trust changes, real gateway serving, and physical sync
execution still stay signed-host or Coordinator gated.
`sync drivers` returns the Sync driver catalog. Each row is manifest-backed,
changelog-backed, authority-scoped, no-write, defaults to
`detect_and_elevate`, forbids plaintext secret replication, and stays gated by
`physical_sync_driver_application` until an approved physical driver run proves
execution. The catalog covers skills, memory/user-model, sessions, drive/files,
blobs, full SQLite, partial SQLite, sidecars, search indexes, agent config, and
workspace state.
`remote compat --record true` records a signed compatibility adapter receipt
for existing Relay/mobile clients. The receipt binds the legacy surface to one
canonical route, requires `mapsToCanonical: true`, forbids parallel APIs with
`parallelApiIntroduced: false`, and is a no-write migration record.
`sync cache --record true` records a signed client cache snapshot with
`encrypted: true`, a TTL, no plaintext payload, no secrets, and no
authoritative state. It is cache metadata only, not a host write.
`sync apply --record true` records a signed `SyncDriverApplicationReceipt`
that binds a reconciled queue to one manifest driver. It records applied change
ids and blocked conflicts, but keeps `physical_sync_driver_application` as
`external_pending` until a signed host driver physically applies the changes.
`sync handoff --record true` records a signed `SyncAuthorityHandoffReceipt`
for changing a resource's authority or residency between nodes. It remains
`signed_pending_authority_handoff`, marks `physical_authority_handoff` as
`external_pending`, and keeps `writes: false` until the physical authority move
is separately proven.
`nodes heartbeat --record true` stores a signed transport-handshake receipt for
the Iroh v1 adapter contract. It verifies the local Coordinator ledger shape
and still marks real multi-device transport and device trust acceptance as
`external_pending` until physical nodes prove the handshake.
`nodes trust --record true` records a signed node-trust decision in the same
ledger. An allow decision remains `signed_pending_physical_acceptance` until
the target device completes physical acceptance; it does not silently grant
remote authority by itself.
`nodes accept --record true` records a signed `MeshInvitationAcceptance` for
an invitation scope. Acceptance is still not physical peer trust: without a
real device trust run it remains `signed_pending_peer_trust`, marks
`physical_peer_trust` and `device_trust_acceptance` as pending, and keeps
`writes: false`.
`gateway serve|project --record true` records signed Gateway deployment
manifests for self-hosted and hosted projections. Both carry the same required
route contract and parity flag; real process binding or hosted rollout remains
`external_pending` until physical deployment validation is run.
`gateway agent-service --record true` records a signed
`RemoteAgentServiceExecutionReceipt` for the governed service decision. The
receipt binds tenant, agent, assignment, route, budget, billing account, meter,
isolation key, and audit id; without approved runtime/billing execution it
marks `agent_runtime_execution` and `billing_meter_persistence` as
`external_pending`.
`gateway audit --record true` records a signed `RemoteGatewayAuditReceipt`
that bridges a Gateway authorization/runtime event to
`hostAuditStore: signed_host_audit`. It binds actor, route, resource, action,
and allow/deny decision, but keeps `signed_host_audit_persistence` as
`external_pending` until a signed host audit store physically persists the
event.
`gateway secret-lease` records a signed, expiring lease for a secret reference,
never reads or returns the secret value, and rejects plaintext-return flags.
`gateway secret-provider` adds a signed provider receipt bound to a broker
lease, provider id, credential binding, actor, and resource. It still never
returns plaintext; without an approved live provider run it records
`provider_secret_retrieval` as `external_pending`.

## System Telemetry

`claw system` is the read-only system state portal for agents and local tools.
It preserves `claw system capabilities ...` for host capability management and
adds telemetry, metric history, rules, and widget configuration:

```bash
claw system snapshot --json
claw system snapshot --record true --json
claw system snapshot --record true --raw-retention 6h --rollup-retention 7d --json
claw system metrics list --json
claw system history system.cpu.load1 --range 1h --json
claw system watch --interval 2000 --jsonl
claw system rules list --json
claw system rules upsert cpu-load-high --metric-key system.cpu.load1 --operator gte --threshold 8 --severity warning --json
claw system rules delete cpu-load-high --json
claw system widgets list --json
claw system widgets upsert cpu-menu --metric-key system.cpu.load1 --presentation sparkline --placement menubar --json
claw system widgets delete cpu-menu --json
claw system providers list --json
```

Snapshots expose safe aggregate values by default and mark deeper hardware,
permissioned, signed-host, or provider-backed metrics as unavailable until a
validated provider supplies them. `--record true` stores the safe snapshot in
the local metric store so `history` can return raw samples, minute rollups, and
rule incidents. Raw sample retention is short by default (`6h`); rollups and
incidents default to `7d` and can be adjusted per write with
`--raw-retention`, `--rollup-retention`, and `--incident-retention`. The store
defaults to `~/.claw/data/monitor.sqlite` and can be overridden with
`--monitor-db`, `CLAW_MONITOR_DB_PATH`, `CLAW_MONITOR_DATA_DIR`,
`CLAW_DATA_DIR`, or `CLAW_HOME`. Rule and widget upserts mutate only local
configuration under `.claw/data/system-telemetry-state.json`; they do not
control hardware. `system providers list` exposes mock/offline provider slots
for weather, build status, local services, agent runs, reminders, calendar, and
custom context metrics; live providers remain disabled or external-pending until
configured with explicit grants and credential references. Physical controls,
sensitive detail, precise location, calendar detail, network identifiers, and
process detail remain grant/audit
gated and signed-host brokered.

Local agent records are managed through the agent-facing data commands. These
commands write canonical files under `~/.claw/` and project searchable
summaries into the main core database:

```bash
claw agents list --json
claw agents upsert agent.ops --name "Ops Agent" --personalities personality.review --skills deploy --secret-ref vault://agents/ops --json
claw agents schema --json
claw agents evaluate-access --record '{"requested":{"resourceType":"contact","action":"read"},"agentGrants":[],"assignmentGrants":[],"executionProfileGrants":[],"connectorGrants":[],"hostGrants":[],"runScopeGrants":[]}' --json
claw agents delegation-check --record '{"parent":{"requested":{"resourceType":"collection","resourceId":"project_notes","action":"read"},"agentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"assignmentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"executionProfileGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"connectorGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"hostGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"runScopeGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}]},"child":{"requested":{"resourceType":"collection","resourceId":"project_notes","action":"read"},"agentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"assignmentGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"executionProfileGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"connectorGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"hostGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}],"runScopeGrants":[{"resourceType":"collection","resourceId":"project_notes","action":"read"}]}}' --json
claw agents supervisor-check --record '{"supervisor":{"id":"agent.manager","authorityLevel":"approve_low_risk","scopeType":"team","scopeId":"support"},"targetAgent":{"id":"agent.ops","managerAgentId":"agent.manager","teamId":"support"},"request":{"action":"pause_assignment","risk":"low","scopeType":"team","scopeId":"support"}}' --json
claw agents route-check --record '{"assignment":{"id":"assignment.web","agentId":"agent.ops","kind":"external_web_chat","status":"active","channel":"chat"},"kind":"external_web_chat","channel":"chat"}' --json
claw agents resolve-external-identity --record '{"provider":"web","externalId":"visitor-1","email":"visitor@example.com","privacyPolicy":"hashed"}' --json
claw agents project-support-inbox --record '{"sessionId":"session-1","assignment":{"id":"assignment.web","agentId":"agent.ops","kind":"external_web_chat","status":"active","channel":"chat"},"identity":{"externalUserId":"external_user_1","actorId":"actor_external_1","contactProjection":"create_or_update","boundary":{"scopeType":"external_user","scopeId":"external_user_1"},"telemetry":{}},"initialMessage":"Need help"}' --json
claw agents memory-check --record '{"policy":{"readScopes":[{"layer":"global","access":"read"}],"writeScopes":[{"layer":"agent_private","access":"write"}],"writePolicy":"private_only"},"request":{"operation":"write","layer":"agent_private"}}' --json
claw agents budget-check --record '{"policy":{"exceededBehavior":"deny_action","limits":[{"dimension":"external_actions","limit":5,"used":1}]},"request":{"dimension":"external_actions","cost":1,"externalPaidAction":true,"connectorGateAllowed":true}}' --json
claw agents action-severity --record '{"action":"invoke","resourceType":"connector","externalSideEffect":true,"paidAction":true}' --json
claw agents autonomy-check --record '{"profile":"act_limited","action":{"action":"invoke","resourceType":"connector","externalSideEffect":true,"paidAction":true},"connectorGateAllowed":true,"budgetAllowed":true}' --json
claw agents dispatch-plan --record '{"agentId":"agent.ops","assignment":{"id":"assignment.relay","agentId":"agent.ops","kind":"relay","status":"active","channel":"relay"},"assignmentRequest":{"kind":"relay","channel":"relay"},"executionProfile":{"id":"execution.async","executionMode":"async","status":"active","runtime":"service"},"autonomy":{"profile":"act_limited"},"action":{"action":"write","resourceType":"collection"}}' --json
claw agents context-pack --record '{"agentId":"agent.ops","assignmentId":"assignment.relay","view":{"id":"view.customer","allowedResourceTypes":["contact"],"allowedScopes":[{"scopeType":"customer","scopeId":"customer_1"}],"includeContent":true},"requested":[{"id":"ctx.contact","resourceType":"contact","resourceId":"contact_1","scopeType":"customer","scopeId":"customer_1","content":{"name":"Customer"}}],"agentGrants":[{"resourceType":"*","action":"read","scopeType":"customer","scopeId":"customer_1"}],"assignmentGrants":[{"resourceType":"*","action":"read","scopeType":"customer","scopeId":"customer_1"}],"executionProfileGrants":[{"resourceType":"*","action":"read","scopeType":"customer","scopeId":"customer_1"}],"connectorGrants":[{"resourceType":"*","action":"read","scopeType":"customer","scopeId":"customer_1"}],"hostGrants":[{"resourceType":"*","action":"read","scopeType":"customer","scopeId":"customer_1"}],"runScopeGrants":[{"resourceType":"*","action":"read","scopeType":"customer","scopeId":"customer_1"}]}' --json
claw agents tool-catalog --record '{"agentId":"agent.ops","assignmentId":"assignment.relay","allowedDomains":["support"],"tools":[{"id":"support.contacts.lookup","title":"Lookup contact","description":"Read contact context.","domain":"support","sourceFeature":"support","parameters":{"type":"object"},"riskLevel":"safe"}],"agentGrants":[{"resourceType":"tool","action":"invoke","scopeType":"domain","scopeId":"support"}],"assignmentGrants":[{"resourceType":"tool","action":"invoke","scopeType":"domain","scopeId":"support"}],"executionProfileGrants":[{"resourceType":"tool","action":"invoke","scopeType":"domain","scopeId":"support"}],"connectorGrants":[{"resourceType":"tool","action":"invoke","scopeType":"domain","scopeId":"support"}],"hostGrants":[{"resourceType":"tool","action":"invoke","scopeType":"domain","scopeId":"support"}],"runScopeGrants":[{"resourceType":"tool","action":"invoke","scopeType":"domain","scopeId":"support"}]}' --json
claw agents creation-review --record '{"surface":"external_channel","agent":{"id":"agent.ops","name":"Ops","role":"Support"},"assignments":[{"id":"assignment.relay","agentId":"agent.ops","kind":"relay","status":"active","channel":"relay"}],"executionProfiles":[{"id":"execution.async","executionMode":"async","hostAccess":"none","networkPolicy":"connector_only"}],"budgets":[{"id":"budget.relay","exceededBehavior":"deny_action","limits":[{"dimension":"external_actions","limit":10}]}]}' --json
claw agents storage-audit --record '{"legacyCollections":["company_agents"],"observedTables":["agents","agent_assignments"]}' --json
claw agents audit-coverage --record '{"expectedKinds":["blueprint","service_api"],"events":[{"id":"audit.blueprint","kind":"blueprint","agentId":"agent.ops","result":"recorded","redaction":"strict","createdAt":"2026-05-17T10:00:00.000Z","metadata":{"kind":"blueprint"}}]}' --json
claw agents operational-snapshot --record '{"agentId":"agent.ops","assignments":[{"id":"assignment.relay","agentId":"agent.ops","status":"active"}],"runs":[{"id":"run.1","agentId":"agent.ops","status":"running"}],"sessions":[{"id":"session.1","agentId":"agent.ops","status":"active"}],"audits":[{"id":"audit.run","kind":"dispatch_plan","agentId":"agent.ops","result":"recorded","redaction":"strict","createdAt":"2026-05-17T10:00:00.000Z","metadata":{}}]}' --json
claw agents control-panel --record '{"surface":"external_channel","agent":{"id":"agent.ops","name":"Ops","autonomyProfile":"respond_only"},"assignments":[{"id":"assignment.web","agentId":"agent.ops","kind":"external_web_chat","status":"active","privacyPolicy":"hashed"}],"executionProfiles":[{"id":"execution.web","executionMode":"async","networkPolicy":"connector_only"}],"resourceGrants":[{"id":"grant.support","resourceType":"collection","resourceId":"support_conversations","action":"read","effect":"allow"}],"memoryPolicies":[{"id":"memory.support","writePolicy":"private_only","crossUserBoundary":"explicit_grant_only"}],"budgets":[{"id":"budget.support","exceededBehavior":"deny_action","limits":[{"dimension":"external_actions","limit":5}]}]}' --json
claw agents privacy-plan --record '{"operation":"export","subject":{"scopeType":"external_user","scopeId":"external_user_1"},"agent":{"id":"agent.ops","name":"Ops"},"supportMessages":[{"id":"message.1","externalUserId":"external_user_1","body":"Need help"}]}' --json
claw agents paperclip-import --record '{"packageId":"paperclip.ops","agentsMd":"# Ops Reviewer\nRole: reviewer\nSkills: skill.review@1\nInstructions: Review safely.","package":{"skills":[{"ref":"skill.shared","version":"1"}]}}' --json
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
through a weaker parent. `supervisor-check` limits managers/supervisors by
reporting relationship, delegated action, maximum risk, and scope before they
can approve or change another agent. Budgets are checked with `budget-check`;
external paid actions require both a budget allowance and connector gate before dispatch.
`action-severity` classifies proposed actions as `info`, `low`, `medium`,
`high`, or `critical` and returns the approval, connector, budget, and host
gates required before dispatch. `autonomy-check` applies the agent's
`respond_only`, `suggest`, `act_limited`, or `act_full` profile to that
severity and gate state before an action can be dispatched.
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
claw commands resolve "lead list" --json
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

Audited built-in collection aliases are part of the resolver. For example,
`lead list` resolves as covered and maps to `db leads list`, so the natural
top-level collection phrase and the explicit database route stay tied to the
same canonical collection.

Unknown command JSON includes `meta.commandIntent`. Human unknown-command output
stays brief and points to `claw commands resolve`. Candidate aliases are
inactive suggestions, not routing changes. `future`, `blocked`, and
`external_pending` entries must describe next steps without producing executable
plans for risky or unavailable actions. See
[ADR 0018: CLI action intent registry](./adr/0018-cli-action-intent-registry.md)
for the durable contract.

## Regulated Domain Safety

`claw safety` exposes the regulated-domain boundary for agents and scripts. It
is read-only: it classifies domains, explains policy, checks a proposed
decision effect, and returns the disclaimer/output-label contract without
executing sensitive work.

```bash
claw safety domains --json
claw safety classify health --json
claw safety check --domain finance --effect final_decision --use investment_or_credit_decision --json
claw safety explain legal --json
claw safety disclaimers mental_health --json
```

The safe default is local recordkeeping, search, extraction, factual summary,
questions to review, gaps/provenance, non-final drafts, and preparation for
human or professional review. Final regulated decisions, diagnosis/treatment,
professional advice as a final answer, emergency handling, and autonomous
sensitive external actions are blocked or require explicit review under
[ADR 0026](./adr/0026-regulated-domain-safety-liability-boundary.md).

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

claw project inspect --project .
claw project attach . --workspace-id ops-main --accept
claw project detach . --reason copied-to-new-workspace
claw project export . --output project-handoff.clawexport
claw project import project-handoff.clawexport . --workspace-id ops-main --accept
claw project sync-handoff .

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
claw encounter add --patient patient_123 --title "Intake visit" --json
claw patient patient_123 encounter add "Follow-up visit" --encounter-type follow_up --json
claw patient patient_123 encounters list --json
claw medication add --patient patient_123 --json
claw patient patient_123 medications list --json
claw patients list --json
claw patient patient_123 symptoms add "Headache" --severity 4 --json
claw patient patient_123 symptoms list --json
claw patient patient_123 lab add "CBC panel" --lab "Central Lab" --json
claw patient patient_123 labs list --json
claw lab add --patient patient_123 --title "Metabolic panel" --json
claw patient patient_123 timeline --json
claw company create "Acme Corp" --json
claw companies list --json
claw company company_123 timeline --json
claw account create "Acme Account" --company company_123 --json
claw deal create "Pilot" --company company_123 --account-id account_123 --json
claw crm account account_123 overview --json
claw erp company company_123 overview --json
claw invoice list --json
claw invoice create INV-001 --billing-customer billing_customer_123 --total-cents 9900 --json
claw payment create --billing-customer billing_customer_123 --invoice-id invoice_123 --amount-cents 9900 --json
claw case create "Smith v Jones" --json
claw case case_123 client add "Smith Client" --json
claw case case_123 clients list --json
claw legal-client add --case case_123 --display-name "Direct Legal Client" --json
claw case case_123 evidence add "Signed contract" --json
claw case case_123 evidence list --json
claw case case_123 timeline --json
claw service create API --company company_123 --json
claw incident create Outage --service service_123 --severity sev2 --json
claw service service_123 incidents list --json
claw service service_123 timeline --json
claw study create "Trial A" --json
claw study study_123 participants add "Subject 001" --json
claw study study_123 participants list --json
claw study study_123 cohort list --json
claw study study_123 timeline --json
claw sample create "Tube A" --study-id study_123 --json
claw assays list --json
claw sample sample_123 assays add CBC --json
claw sample sample_123 timeline --json
claw learner create "Ada Learner" --json
claw course create "Intro Biology" --json
claw relation create --from-entity-kind learners --from-entity-id learner_123 --to-entity-kind courses --to-entity-id course_123 --type member_of --json
claw course course_123 lessons add "Cell basics" --json
claw course course_123 lessons list --json
claw course course_123 timeline --json
claw learner learner_123 timeline --json
claw employee create "Ada Employee" --company company_123 --json
claw employee employee_123 time-off add --kind vacation --json
claw employee employee_123 reviews list --json
claw time-off add --employee employee_123 --kind sick --json
claw employee employee_123 timeline --json
claw property create "Main Street Loft" --city Madrid --json
claw property property_123 visits list --json
claw property property_123 offer add --buyer-name "Ada Buyer" --amount-cents 250000 --json
claw property-offer add --property property_123 --buyer-name "Direct Buyer" --json
claw property property_123 timeline --json
claw insurance-policy create "Home policy" --provider "Example Mutual" --json
claw insurance-policy insurance_policy_123 timeline --json
claw vehicle-insurance-policy add --vehicle vehicle_123 --provider "Example Mutual" --json
claw vehicle vehicle_123 maintenance add "Annual service" --json
claw vehicle-maintenance add --vehicle vehicle_123 "Direct service" --json
claw appliance appliance_123 maintenance add "Washer service" --json
claw appliance-maintenance add --appliance appliance_123 "Direct washer service" --json
claw vehicle vehicle_123 timeline --json
claw supplier supplier_123 purchase-orders add PO-001 --json
claw purchase-order purchase_order_123 line-items add "Press frame" --json
claw purchase-order purchase_order_123 timeline --json
claw warehouse warehouse_123 inventory-items add "Press frame" --json
claw inventory-item inventory_item_123 stock-movements add --quantity 10 --json
claw warehouse warehouse_123 timeline --json
claw supply-plan supply_plan_123 items add "Press shortage" --supplier supplier_123 --purchase-order purchase_order_123 --warehouse warehouse_123 --inventory-item inventory_item_123 --json
claw supply-plan supply_plan_123 risks add "Supplier lead-time risk" --supplier supplier_123 --json
claw supply-plan supply_plan_123 timeline --json
claw carrier create "Fast Freight" --company company_123 --json
claw carrier carrier_123 shipments add "PO-001 inbound shipment" --purchase-order purchase_order_123 --warehouse warehouse_123 --json
claw carrier carrier_123 freight-rates add "Fast Freight LTL" --amount-cents 15000 --currency USD --json
claw shipment shipment_123 legs add "Origin to warehouse" --carrier carrier_123 --json
claw shipment shipment_123 timeline --json
claw control control_123 assessments add "Q2 access review" --json
claw control control_123 findings add "Missing reviewer sign-off" --json
claw control control_123 timeline --json
claw agency create "City Permitting Office" --json
claw agency agency_123 public-cases add "Lab buildout permit case" --company company_123 --json
claw public-case public_case_123 filings add "Permit application" --agency agency_123 --json
claw public-case public_case_123 permits add "Lab buildout permit" --agency agency_123 --json
claw public-case public_case_123 timeline --json
claw thing thing_123 devices add "Press vibration sensor" --json
claw iot-device device_123 readings add vibration --value 0.42 --json
claw iot-device device_123 commands add "Restart gateway" --json
claw thing thing_123 timeline --json
claw construction-project construction_project_123 sites add "Lab site" --json
claw construction-project construction_project_123 rfis add "Ventilation clarification" --json
claw construction-project construction_project_123 change-orders add "Ventilation upgrade" --json
claw construction-project construction_project_123 timeline --json
claw product list --json
claw products list --json
claw product create "Hydraulic Press" --company company_123 --json
claw product-spec create "Hydraulic Press Spec" --product product_123 --company company_123 --json
claw product-spec product_spec_123 revisions add "Revision A" --product product_123 --json
claw product-spec product_spec_123 requirements add "Emergency stop response" --product product_123 --json
claw product-spec product_spec_123 boms add "Press frame BOM" --product product_123 --component product_123 --json
claw product-spec product_spec_123 timeline --json
claw drug-product create "Example Therapy" --product product_123 --product-spec product_spec_123 --company company_123 --json
claw drug-product drug_product_123 batches add "Batch B-001" --company company_123 --json
claw drug-product drug_product_123 lot-releases add "Lot release B-001" --batch batch_record_123 --json
claw drug-product drug_product_123 adverse-events add "Headache safety event" --patient patient_123 --study study_123 --json
claw drug-product drug_product_123 timeline --json
claw content-brand create "Acme Editorial" --company company_123 --json
claw content-destination create "Acme Blog" --brand content_brand_123 --json
claw content-campaign create "Launch Campaign" --brand content_brand_123 --json
claw content-entry create "Launch note" --brand content_brand_123 --campaign content_campaign_123 --json
claw content-entry content_entry_123 revisions add "Launch note revision 1" --json
claw content-entry content_entry_123 variants add "Blog variant" --destination content_destination_123 --json
claw content-entry content_entry_123 approvals add --variant content_variant_123 --destination content_destination_123 --json
claw content-entry content_entry_123 publications add --variant content_variant_123 --destination content_destination_123 --json
claw content-entry content_entry_123 timeline --json
claw asset create --company company_123 --account-id account_123 --product product_123 --serial-number PRESS-001 --json
claw asset asset_123 work-orders add "Batch 42" --company company_123 --json
claw asset asset_123 work-orders list --json
claw asset asset_123 timeline --json
claw work-order create "Batch 42" --company company_123 --json
claw work-order work_order_123 timeline --json
claw financial-account create "Operating Account" --json
claw transaction create Lunch --account financial_account_123 --amount-cents 1200 --json
claw finance entity financial_account_123 overview --json
claw accounting entity financial_account_123 overview --json
claw organism create "Mouse A" --species "Mus musculus" --json
claw experiment create "Dose response" --organism organism_123 --json
claw experiment experiment_123 samples add "Exp sample 1" --organism organism_123 --json
claw experiment experiment_123 timeline --json
claw lab-notebook create "Trial A notebook" --study study_123 --experiment experiment_123 --json
claw lab-notebook lab_notebook_123 entries add "Day 1 setup" --sample sample_123 --assay assay_123 --json
claw lab-notebook lab_notebook_123 protocol-runs add "Dose response run" --experiment experiment_123 --sample sample_123 --json
claw protocol-run protocol_run_123 observations add "Marker intensity" --lab-notebook lab_notebook_123 --sample sample_123 --assay assay_123 --json
claw lab-notebook lab_notebook_123 timeline --json
claw dense-fixtures seed --json
claw domain-system get fixture_domain_system_health --json
claw domain-profile get fixture_domain_profile_health_patient --json
claw domain-intent list --json
claw evidence-source create "Clinic note" --kind document --collection-name patients --record-id patient_123 --json
claw quality-gap create "Missing date of birth" --target-collection patients --target-id patient_123 --gap-kind missing --json
claw semantic-view list --json
claw travel --help
claw career --help
claw family --help
claw legal --help
claw finance --help
claw location --help
claw accounts --help
claw accounts list --json
claw accounts upsert apple_app_main --provider apple --kind app --set bundle_id=com.example.app --set sku=SKU123 --json
claw accounts link-secret revenuecat_api_v2 --field api_key --secret-ref secret://revenuecat/v2 --json
claw accounts defaults set --context revenuecat_api_v2 --provider revenuecat --scope provider:revenuecat --json
claw accounts schema apple --json
claw accounts doctor --json
claw accounts explain apple --operation apple.upload --env production --json
claw accounts export --provider apple --mode redacted --json
claw accounts export --mode private-envelope --json
claw connectors context explain revenuecat --operation revenuecat.project_configuration.read --json
```

`accounts` is the human-facing governed connector context surface. It lists and
explains provider accounts, apps, environments, products, signing identities,
defaults, and fallbacks without exposing plaintext secrets. `connectors context`
is the same surface under the connector control-plane umbrella. Local
configuration commands persist non-secret records, state, defaults, policy,
guidance, and `secret_ref` links in `core.sqlite`; real provider import or
mutation remains explicit-approval work. `accounts export` is redacted by
default. `--mode private-envelope` includes private non-secret fields for a
protected handoff, but still omits plaintext secrets and exports only binding
metadata for secret fields.

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
claw search entrypoints --json
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
