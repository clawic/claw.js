# Security Policy

## Supported versions

Only the latest `0.x` line is supported.

## Reporting

Do not open public issues for suspected vulnerabilities that could expose credentials, workspace contents, or remote execution paths. Report them privately to the maintainers first.

Repository ownership and review routing live under [`@clawic`](https://github.com/clawic). The primary maintainer is Iván González Dávila ([`@ivangdavila`](https://github.com/ivangdavila)).

## Incident response

Operational incident response lives in [docs/incident-response.md](docs/incident-response.md). It defines severity, embargo, containment, patch release, user notification, key rotation, compromised connector, malicious plugin/sub-app, remote exploit, official artifact compromise, and data-loss handling.

## Supply-chain security

Supply-chain security policy lives in [docs/supply-chain-security.md](docs/supply-chain-security.md). Private vulnerability reports are acknowledged within 48 hours. Exploitable critical dependency, package, plugin, release, or artifact-integrity issues require a mitigation or release plan within 24 hours and fix or disablement within 72 hours; high issues target 7 days, medium 30 days, and low 90 days. Non-exploitable dependency findings use VEX-style triage notes.

## Secret handling expectations

- ClawJS masks common secret fields in logs and CLI JSON output, but callers should still avoid printing raw credentials.
- `auth.setApiKey()` and `auth.saveApiKey()` are low-level APIs. Prefer provider login flows, environment injection, or external secret stores when possible.
- Workspace audit logs are persisted under `.claw/audit/`. Review retention and redaction expectations before shipping ClawJS into regulated environments.
- Support diagnostics are manual opt-in. Redact private data before sharing logs, screenshots, workspaces, databases, crash reports, or provider traces. See [PRIVACY.md](PRIVACY.md).
- Sensitive-domain workflows must preserve the boundary in [SAFETY.md](SAFETY.md) and [REGULATED_DOMAINS.md](REGULATED_DOMAINS.md): ClawJS may support local records, summaries, and review drafts, but must not become the final authority for regulated decisions.
