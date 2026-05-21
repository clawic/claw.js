---
title: Incident Response
description: Operational security incident response playbook for ClawJS, Clawix hosts, connectors, plugins, sub-apps, releases, secrets, remote routes, and data-loss events.
---

# Incident Response

This playbook is the canonical public incident-response policy for ClawJS and
host projections such as Clawix. `SECURITY.md` explains how to report a
suspected vulnerability; this document defines how maintainers classify,
contain, repair, notify, and close operational security incidents.

It covers framework code, official packages, official release artifacts,
connectors, plugins, marketplace packages, sub-apps, Relay/Gateway/Connector/
Sync/mesh routes, secrets, update channels, and user data. Host-specific
consequences are mirrored by Clawix.

## Response Phases

Every incident record must track these phases:

1. `intake`: receive the report privately, preserve evidence, assign an
   incident id, and acknowledge within 48 hours.
2. `classify`: assign severity, affected surfaces, exploitability, data
   exposure, user impact, and current embargo state.
3. `contain`: disable, revoke, quarantine, gate, rotate, blocklist, or pause
   affected capabilities before broad investigation when user protection
   requires it.
4. `investigate`: reproduce with fixtures or safe local evidence, identify the
   root cause, affected versions, and whether exploitation or data loss is
   confirmed, probable, or not observed.
5. `patch_or_disable`: ship a patch release, configuration change, package
   removal, connector disablement, artifact revocation, or documented
   mitigation.
6. `notify`: notify affected users when action is required, exposure is
   confirmed or probable, user trust decisions changed, or a public advisory is
   needed.
7. `rotate_or_revoke`: rotate keys, tokens, signatures, release credentials,
   grants, connector leases, plugin trust records, or compromised endpoints.
8. `recover`: verify backups, imports, restores, rollback, reindexing,
   connector resync, and user-visible recovery state.
9. `postmortem`: publish a public-safe summary after the embargo lifts and
   record follow-up guardrails or debt.

No phase may require publishing secrets, exploit payloads, private paths,
private user data, maintainer-private channels, release credentials, or
unredacted logs.

## Severity Model

- `SEV0 critical`: active exploitation, remote code execution, official
  artifact compromise, plaintext secret exposure, broad data loss, malicious
  official plugin or sub-app, compromised update channel, or any incident that
  requires immediate user-protective containment.
- `SEV1 high`: credible exploit path, limited credential or private-data
  exposure, connector compromise, bypass of approvals or grants, remote route
  abuse, or limited data loss requiring urgent containment.
- `SEV2 medium`: security defect with constrained exploitability, no confirmed
  exposure, missing hardening on a non-default path, or a dependency finding
  requiring tracked mitigation.
- `SEV3 low`: hardening, documentation, defense-in-depth, non-exploitable
  finding, or a report that needs public-safe clarification.

The supply-chain SLA remains the baseline: acknowledge private reports within
48 hours; for critical issues, produce a mitigation or release plan within 24
hours and fix or disable within 72 hours. In shorthand: acknowledge within 48
hours, critical plan within 24 hours, critical fix within 72 hours, high issues
target 7 days, medium 30 days, and low 90 days. Operators may also record the
same SLA as: high issues target 7 days.
The compact SLA phrase is: high issues target 7 days.

When severity is uncertain, classify higher until evidence supports lowering
it. If user data, plaintext secrets, remote execution, malicious official
packages, or irreversible data loss are plausible, start at `SEV0` or `SEV1`.

## Embargo And Disclosure

Security incidents default to embargoed operational details until a fix,
disablement, revocation, or user-protective mitigation is available. During the
embargo:

- keep reproduction details, exploit payloads, keys, tokens, private paths,
  private package metadata, user data, and unredacted logs out of public issues,
  docs, fixtures, screenshots, and generated artifacts;
- share only public-safe status needed for user protection;
- do not publish, tag, upload, push, notarize, submit, or release as an
  incident action without explicit release approval for that exact action;
- preserve enough private evidence to audit the response without adding it to
  the public repo.

Lift the embargo only after affected users have a protective action path or the
maintainers determine the report is not exploitable. Public advisories should
name affected versions, severity, mitigation, fixed versions or disablement,
and whether key rotation, connector revocation, data recovery, or update action
is required.

## Scenario Playbooks

### Remote Exploit

Remote code execution, unauthorized remote route execution, hostile network
peer abuse, Relay/Gateway/Connector/Sync bypass, or remote-safe policy failure
is `SEV0` unless proven otherwise. Containment must prefer disabling the route,
revoking remote trust, blocking affected protocol versions, or forcing local
approval before investigating convenience-preserving fixes.

Patch releases must include regression coverage for the route boundary,
approval/grant chain, audit evidence, and the threat-model row or ADR that owns
the affected surface.

### Plaintext Secret Or Key Exposure

Plaintext secret exposure, release credential exposure, signing key exposure,
broker bypass, connector lease leakage, or public artifact leakage is `SEV0` or
`SEV1` depending on scope. The default action is rotate or revoke first, then
patch. New secret use must fail closed for compromised, archived, over-limit,
or policy-denied references.

Notifications must tell affected users which secret class is involved, whether
rotation is required, what has already been revoked, and which logs or
diagnostics should be treated as sensitive.

### Compromised Connector

A compromised connector, provider app, OAuth client, external CLI, webhook, MCP
server, account context, or governed connector context is at least `SEV1` and
becomes `SEV0` when it can expose plaintext secrets, mutate remote state, spend
money, or execute code broadly.

Containment options include pausing the connector, revoking credential leases,
disabling provider actions, removing default selections, invalidating grants,
and marking live validation `EXTERNAL PENDING` until a safe provider path is
available.

### Malicious Plugin Or Sub-App

A malicious official plugin, marketplace package, bundled helper, template, or
sub-app is `SEV0`. A suspected unreviewed or community package is `SEV1` until
review proves otherwise. Activation must fail closed or enter quarantine when
signatures, provenance, capability review, malware-review metadata, native
binaries, lifecycle scripts, or obfuscation review are missing.

Containment includes marketplace delisting, plugin verification blocklists,
capability disablement, package revocation, artifact checksums revocation, and
update-channel advisory text that does not include exploit instructions.

### Data-Loss Incident

Confirmed or probable irreversible loss of workspace data, archives, restore
state, sync state, connector data, imports, exports, migrations, or provider
mutations is at least `SEV1` and becomes `SEV0` when broad, active, or
irreversible. Apply the no-irreversible-data-loss guardrail: classify recovery
class, approval policy, audit receipt, rollback path, and evidence before
claiming closure.

User notification is required when users must stop using a feature, preserve
local evidence, restore from backup, export data, rotate a connector, or apply a
patch to prevent further loss.

### Official Artifact Or Update Compromise

Compromised official packages, installers, app bundles, templates, checksums,
SBOMs, provenance, signing, npm publishing, GitHub releases, or update channels
are `SEV0`. Contain by revoking or replacing artifacts, disabling update
channels, publishing safe checksums, and running supply-chain verification
before any replacement release.

Patch or replacement releases must include release evidence, vulnerability
triage, dependency review when relevant, and artifact-integrity proof.

## User Notification

Notify users when an incident creates confirmed or probable exposure, requires
rotation or revocation, affects update trust, disables a feature they may rely
on, requires data recovery, or changes the safety of a connector, plugin,
sub-app, remote route, or official artifact.

Notifications must be public-safe and action-oriented. They should include:
affected versions or surfaces, severity, what happened at a high level,
confirmed vs probable impact, required user actions, fixed version or
disablement status, rotation or recovery steps, and where to find updates.

Do not include exploit payloads, private reporter identity, private paths,
maintainer-private channels, raw tokens, private user data, or unredacted logs.

## Closure Criteria

An incident can close only when:

- containment is complete or explicitly accepted as residual risk;
- affected users have a patch, disablement, revocation, recovery, or mitigation
  path;
- key rotation, connector revocation, plugin quarantine, update-channel repair,
  or data recovery is complete where applicable;
- tests, guardrails, docs, or ADR references cover the class of failure;
- public-safe postmortem or advisory text is prepared when disclosure is
  required;
- private evidence remains outside public repositories.

Closure reports must distinguish confirmed, probable, discarded, and partially
validated causes. Fixture-only validation is partial when the incident depends
on real providers, signed hosts, package registries, native permissions,
physical devices, or production release channels.

## Validation

Run:

```bash
node scripts/incident-response-check.mjs
node scripts/incident-response-check.mjs --self-test
npm run test:docs
```

Discovery must return this playbook for:

```bash
claw search "incident response" --json
claw search "remote exploit" --json
claw search "compromised connector" --json
```
