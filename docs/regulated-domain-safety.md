# Regulated Domain Safety

ClawJS supports sensitive domains as local-first records and review
workspaces. It does not replace doctors, therapists, lawyers, financial
advisers, banks, insurers, employers, schools, public authorities, emergency
services, or other regulated professionals.

The executable policy is in
`packages/clawjs-core/src/regulated-domain-safety.ts` and is accepted by
[ADR 0026](./adr/0026-regulated-domain-safety-liability-boundary.md). Sensitive,
external, export/share, remote/sync, connector, agent, CLI, and release
surfaces must build a classified action context and evaluate it through this
shared policy instead of adding command-local legal checks.

## Default allowed use

The default safe envelope is:

- local recordkeeping
- search
- extraction
- factual summary
- questions to review
- gaps and provenance
- non-final drafts
- preparation for human or professional review

Sensitive outputs must be labeled as drafts, not professional advice, requiring
human review, and requiring sources and gaps.

## Default blocked use

Claw must not make final regulated decisions. The policy blocks or prohibits
diagnosis, treatment, therapy or crisis counseling, final legal advice,
investment or credit decisions, insurance coverage decisions, employment
decisions, education/admission decisions, government benefits decisions,
emergency handling, social scoring, harmful manipulation, sensitive biometric or
emotion inference, criminal-risk profiling, and autonomous regulated filings or
submissions.

## Required gates

`evaluateRegulatedAction(...)` returns a compact policy decision:

- `allow`: the action can continue with the returned labels, disclaimer, and
  audit requirements.
- `confirm`: the action is not blocked, but requires explicit review, consent,
  destination authorization, labels, or opt-in before execution.
- `block`: the action is outside the allowed product boundary.
- `log-only`: the action is safe to continue and only needs configured local
  audit handling.

The central policy is the only place that decides legal state. Individual
commands and services may translate local input into `policyConfig`, but must
not invent separate legal decisions or per-surface labels. Configurable facts
include `mode: "strict" | "normal" | "authorized_automation"`, `confirmed`,
`approvalId`, `legalLabel`, `reviewSatisfied`, `outputLabelsSatisfied`,
`materialConsent`, `destinationAuthorized`, `globalConsent`,
`automationAuthorized`, and `auditOnly`.
Use `authorized_automation` only when the caller can prove the automation is
pre-authorized by policy config or host governance.

External sensitive actions, sensitive export/share, remote/sync, support data,
third-party provider use, and professional contexts require explicit review,
authorized automation, consent, or opt-in through the policy config. Minors
require a strong guard and the official product is 18+ by default.

## Configurable decisions

| Decision | Configurable actions | Absolute boundary |
| --- | --- | --- |
| `allow` | Safe allowed uses; confirmable external/export/remote actions when policy config proves review, consent, destination authorization, output labels, or authorized automation. | Cannot override hard blocks. |
| `log-only` | Safe allowed uses with `auditOnly: true`, where local redacted audit is the configured requirement and no execution approval is needed. | Must not be used to execute side-effecting regulated actions. |
| `confirm` | External action, sensitive export/share, remote/provider use, support disclosure, or regulated Search action when the action is not prohibited but review/config is incomplete. | The caller must stop, ask, or return a brokered preview. |
| `block` | Unknown domain, blocked/prohibited regulated use, final regulated decision, professional-client context, or minor guard failure. | Not configurable by command flags. |

## Route inventory

Routes already passing through `evaluateRegulatedAction`:

- `claw safety check`: `packages/clawjs/src/cli-safety-command.ts`.
- Agents V1 effective access: `packages/clawjs-core/src/agents-v1.ts`.
- Connector Control Plane and MCP regulated tool metadata:
  `packages/clawjs-core/src/connector-control-plane.ts`.
- Remote/sync mesh shares: `packages/clawjs-core/src/remote-sync.ts`.
- CLI download/export review and project handoff:
  `packages/clawjs/src/cli-export-review.ts` and
  `packages/clawjs/src/project.ts`.
- SDK storage and media export/share:
  `packages/clawjs-node/src/storage/store.ts` and
  `packages/clawjs-node/src/media/store.ts`.
- Notify delivery, content publication, and channel sends:
  `packages/clawjs-node/src/notify/index.ts`,
  `notify/src/server/app.ts`, `content/src/server/app.ts`, and
  `packages/clawjs-node/src/create-claw-channel-facades.ts`.
- Search result action execution:
  `packages/clawjs-search/src/index.ts`, with CLI and MCP callers passing
  config instead of deciding legal state locally.

Routes still carrying local legal or approval-shaped logic that must be
reviewed in later migration slices:

- Connector context export: `packages/clawjs/src/cli-connector-context-command.ts`.
- Report submission host approval: `packages/clawjs/src/cli-report-command.ts`.
- Productivity extended release/report approval fields:
  `packages/clawjs/src/cli-productivity-extended-command.ts`.
- IoT approval routes: `iot/src/server/app.ts` and `iot/src/server/tools.ts`.
- Host/app approval UI routes in Relay and Clawix Swift surfaces. These remain
  host permission flows until their legal side is explicitly mapped to central
  policy.

Every new sensitive collection, connector, agent, CLI route, MCP tool, Relay
route, app surface, demo, or docs claim must be classified against the shared
policy before it can be treated as complete.
