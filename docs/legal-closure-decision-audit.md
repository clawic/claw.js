# Legal Closure Decision Audit

Source conversation: `019e3a44-1175-7930-b45c-252f342b5ec2`

Closure state: `active_goal_not_complete`

This audit is the privacy-safe public trace for the pre-public legal closure
decisions. It records the 33 structured source decisions without private
session paths, local device details, credentials, signing identities, bundle
IDs, SKUs, or maintainer-private release data.

The rows below are evidence routing, not a final legal certification. No final
legal certification is made here. The thread goal can close only after the
private source session is re-read again
and every row is proven against current ClawJS, Clawix, website, examples,
packages, CLI, agents, connectors, search, Dense Data, docs, app surfaces,
official binaries, and release gates.

## Decision Rows

| ID | Source decision | Selected answer | Current evidence | Remaining close blocker |
| --- | --- | --- | --- | --- |
| LC-001 | Jurisdiction baseline | UE+US | Terms, EULA, Safety, and Regulated Domains use Spain/EU governing-law language while the policy blocks US/EU high-liability categories without compliance claims. | Final release review must confirm no later public page narrows the baseline. |
| LC-002 | Release timing | Before public | Release docs and package publish gates include legal checks before GitHub/npm/app/web publication; both npm dry-run and direct package publish scripts now run `verify-regulated-domain-safety-goal.mjs` before package publication. | No actual publication, tag, notarization, store submission, or website release is approved by this audit. |
| LC-003 | Risk posture | Block decisions | ADR 0026 and `regulated-domain-safety.ts` block final regulated decisions; Agents V1 effective access now applies regulated safety denial codes even when all grants allow access; Connector Control Plane now evaluates regulated connector metadata with `evaluateRegulatedAction` and fails closed on regulated external/provider/export attempts. | Final cross-surface pass must prove no non-agent route bypasses this policy. |
| LC-004 | Scope | All pre-public | Decision map routes policy through docs, CLI, Dense Data, agents, connectors, remote/sync, Search, Clawix, release, and package surfaces; `dense-data-os.test.ts` now maps regulated dense systems to `regulated-domain-safety` domains and proves final decisions are blocked through `evaluateRegulatedAction`; `agents-v1.test.ts` covers final-decision, connector, remote, and export regulated safety gates; `connector-control-plane.test.ts` covers regulated EHR export blocking through connector metadata; MCP control-plane tests now pass regulated domains/effects into connector safety before protocol invocation; `index.test.ts` and Relay remote-sync tests cover regulated mesh share execution/secret-lease blocking; Search MCP tests cover regulated result action review and label audit. | Full final audit must cover all named channels and not just ClawJS docs. |
| LC-005 | Product claims | Conservative | Marketing/docs scan in `verify-regulated-domain-safety-goal.mjs` blocks unqualified autonomy, advice, payment-detail, and regulated compliance claims; website demos now frame external/payment actions as drafts or approval-gated work. | Final scan must run after the last website/example/package edit. |
| LC-006 | Audience limits | Strong limits | Terms, Disclaimer, Safety, README, and EULA state personal/local assistive use and no professional replacement. | App-store and binary packaging text must be checked before distribution. |
| LC-007 | Legal docs authority | Ready to publish | Terms, Privacy, Disclaimer, Safety, Regulated Domains, EULA, README links, and release checklist exist in public repo text. | User approval is still required for any actual publication. |
| LC-008 | Allowed regulated use | Personal local use | Policy allows recordkeeping, search, extraction, factual summary, questions, gaps, provenance, non-final drafts, and review prep. | Provider, sync, support, and export flows must remain opt-in. |
| LC-009 | Crisis policy | Refusal + resources | Disclaimer and Safety say ClawJS is not an emergency service and block crisis counseling/emergency handling. | Clawix UI refusal/resources must remain covered by app tests before final close. |
| LC-010 | Release legal gate | Maintainer approval enough | Releasing docs require legal docs and conservative claim checks; npm `publish:dry-run` and `publish:packages` both execute the regulated-domain safety verifier before publish commands; real publish/tag/upload actions remain explicit approval work. | Exact release action approval is still required per channel. |
| LC-011 | Terms acceptance | Initial clickwrap | Clawix legal state and tests cover current acceptance persistence. | Final app validation must confirm the user-facing build shows the clickwrap. |
| LC-012 | Binary policy | App EULA | ClawJS and Clawix both have EULA documents for official apps/binaries. | Final binary packaging must link the EULA before signing or distribution. |
| LC-013 | Governing law/forum | Spain/EU | Terms and EULA include Spain and applicable EU law language. | Mandatory local consumer law may still override; no broader legal claim is made. |
| LC-014 | Support data | Manual opt-in | Privacy and Clawix legal settings require manual support diagnostics opt-in; Clawix rescue diagnostics tests prove exported support context is redacted and marked `explicit_approval_only` before any external submission. | Final support UI smoke must confirm the signed app exposes only opt-in diagnostics sharing. |
| LC-015 | Third-party data | Limited and consented | Terms/Privacy say third-party sensitive data requires lawful basis or consent and minimization. | Examples and demos must stay synthetic and consent-safe. |
| LC-016 | Sensitive drafts | Allowed with review | Policy allows non-final drafts and preparation for human/professional review. | Generated outputs must keep mandatory labels. |
| LC-017 | Sensitive interpretation | Summary + questions | Policy allows factual summaries, questions to review, gaps, and provenance, not final advice; Dense Data systems expose `regulatedDomains` while keeping local record organization, provenance, timelines, and gap views separate from final regulated decisions. | Search/Dense Data/agent outputs must continue to expose sources/gaps. |
| LC-018 | External sensitive actions | Explicit review | Policy, Clawix tests, Agents V1 effective access, Connector Control Plane regulated safety, MCP tool control-plane metadata, remote mesh share construction, and Search MCP action plans require sensitive external action/export/remote review; connector host approvals do not bypass regulated safety denial codes, regulated MCP tool calls are denied before protocol invocation, regulated remote shares cannot grant `execute` or `lease_secret` directly, and regulated Search results elevate even `copy` actions to review. | Real provider actions remain explicit-approval work. |
| LC-019 | UI disclaimers | Contextual + remembered | Clawix legal state stores accepted versions and disclaimer policy; tests cover labels and disclaimer version. | Final UI smoke must verify the visual app surface. |
| LC-020 | Legal languages | EN + ES | Legal docs include English and Spanish sections, and `verify-regulated-domain-safety-goal.mjs` now fails if any publishable legal document loses either `## English` or `## Espanol`. | Future docs must keep both languages in sync. |
| LC-021 | Minors | 18+ default | Terms, Privacy, EULA, Regulated Domains, and Clawix legal defaults state official product is not directed to under-18 users. | Store/web age metadata must be checked before submission. |
| LC-022 | Sensitive visibility | Visible with guard | Regulated domains remain visible for local recordkeeping with guards rather than hidden wholesale; CLI human `safety domains` and `safety classify` output is tested to preserve disclaimer and output-label guard metadata when exposing sensitive domains. | UI must keep guard metadata when exposing sensitive domains. |
| LC-023 | Marketing cleanup | Conservative rewrite | Public claim scan blocks banned phrases across README, docs, website, examples, and package READMEs; website helpdesk/workflow copy avoids autonomous-agent claims and keeps replies, closures, and external runs approval-gated. | Final scan must run after all marketing assets are frozen. |
| LC-024 | Package disclaimers | README + CLI | Root README links legal docs and `claw safety` exposes policy/disclaimers; human-readable `safety check` output preserves disclaimer policy and mandatory labels, not only JSON; the release verifier now fails any public npm package that does not ship `README.md` with the package files. | Package README coverage must remain part of release checks. |
| LC-025 | Remote/cloud | Explicit opt-in | Remote/sync docs and Clawix legal state treat remote/sync as opt-in; remote E2E plan stays `EXTERNAL PENDING` for real provider/device runs and now enumerates required topology targets across macOS, Linux, Windows, headless/VPS, mobile/browser clients, and self-hosted/hosted gateways; regulated mesh shares block `execute`/`lease_secret` through `evaluateRegulatedAction` before Relay can propose the share. | Physical/provider remote validation remains external pending without exact approval. |
| LC-026 | Audit retention | Local configurable | Privacy and Clawix persistent legal settings include local audit retention days; Clawix `LegalSafetyTests` prove the retention value is configurable and persists through the legal defaults key. | Final signed app settings smoke must confirm the rendered retention control. |
| LC-027 | Provider terms | User chooses/assumes | Terms/Privacy/EULA say third-party providers are chosen by the user and governed by their own terms; Clawix provider-backed dictation routes skip external provider clients without local provider-disclosure opt-in, and settings-source tests require the provider-responsibility copy. | Live connector import/mutation remains explicit-approval work. |
| LC-028 | Prohibited practices | Broad hard list | Regulated safety policy prohibits social scoring, harmful manipulation, sensitive biometric/emotion inference, criminal-risk profiling, final regulated decisions, emergency handling, and autonomous filings. | Future providers/routes must be classified before release. |
| LC-029 | Professional role | No official professional mode | Terms, Disclaimer, Safety, and EULA state no professional replacement or professional regulated tool. | Product copy must not introduce a professional regulated mode. |
| LC-030 | Output labels | Mandatory labels | Policy and Clawix tests require draft, not professional advice, human review, sources/gaps, domain, and decision-effect labels; CLI safety human output, Dense Data regulated-domain classification, Search result actions, and Search MCP audit metadata preserve regulated labels. | Final output surfaces must preserve labels through export/share. |
| LC-031 | Release channels | GitHub+npm+apps+web | Releasing docs and claim scans cover repo docs, packages, apps/binaries, website, examples, and public docs. | Channel-specific release checklists must run before each exact release action. |
| LC-032 | Versioning | Re-acceptance by version | Clawix tests cover version mismatch forcing legal reacceptance. | Material-version bump policy must be reviewed before binary release. |
| LC-033 | Sensitive exports/share | Confirmation + labels | Clawix legal tests cover sensitive action review with mandatory labels; policy requires review for export/share. | Final export/share implementation paths must remain guarded. |

## Required Evidence Spine

- Source decision extraction must report 33 structured decisions from the
  source conversation.
- `node --import tsx ./scripts/verify-regulated-domain-safety-goal.mjs` must
  pass after the last legal-policy edit.
- Clawix `node scripts/legal_safety_check.mjs` and `swift test
  --disable-sandbox --package-path macos --filter LegalSafetyTests` must pass
  after the last app legal-surface edit.
- Search, Dense Data, Agents V1, Connector Control Plane, Remote/Sync, Relay,
  MCP, CLI, docs, website, examples, and package release gates must be checked
  before final close.
- Real provider/device validation, store submission, notarization, TestFlight,
  npm publish, GitHub release, website publication, tags, and pushes remain
  blocked without explicit approval for that exact action.
