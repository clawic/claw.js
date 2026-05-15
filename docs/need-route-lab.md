# Need Route Lab

Need Route Lab is the local-first Claw lab for turning broad human needs into
structured routes, deterministic evaluations, deduped opportunities, and
approval-gated promotion packets.

Use it when a person or agent needs to explore whether Claw can support a new
workflow without touching real providers, production data, native permissions,
or deployment targets.

## CLI

```bash
claw needs dimensions --json
claw needs pilots --json
claw needs generate --pilot agent_workflow --limit 4 --json
claw needs generate --pilot agent_workflow --mode llm-lateral --json
claw needs evaluate --pilot iot_home --dry-run --save --json
claw needs opportunities list --json
claw needs opportunities dedupe --json
claw needs opportunities promote <opportunity-id> --to report --json
```

## Model

Routes are versioned framework records generated from composable dimensions:
human intent, autonomy preference, domain, target surface, agent topology,
infrastructure, data state, permission risk, deliverable, and validation mode.

Evaluations produce scored opportunities with evidence, affected surfaces,
stable fingerprints, maturity state, kind, and explicit external pending
markers. Saved evaluations live in the workspace at
`.claw/need-routes/need-route-lab.json`.

Generation is deterministic by default. `--mode llm-lateral` emits a normalized
dry-run plan for LLM-assisted lateral exploration, but V1 does not send prompts
or call model providers. Opportunity scoring is composite: severity, human
scope, frequency, route blocker, constitutional risk, effort, reuse/leverage,
and confidence. Evaluations also carry a capability graph linking dimensions,
routes, validation, opportunities, the local ledger, role skills, UI contracts,
and `claw report` promotion packets.

Promotion is intentionally a draft packet in V1. `claw needs opportunities
promote` returns a `claw report` plan for review; it does not publish reports,
call external services, deploy infrastructure, or request host permissions.

See [ADR 0014](./adr/0014-need-route-lab-v1.md) for the accepted
architecture.
