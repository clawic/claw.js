# Report Governance V1 Checklist

Reference conversation: `019e2733-e325-7d00-921a-75d6a0f7734b`.

This checklist maps the accepted decisions to implementation, documentation,
and tests. Items marked `EXTERNAL PENDING` require a real GitHub/host
integration or physical approval surface and are not local bugs.

| # | Decision | Evidence |
| --- | --- | --- |
| 1 | Gobierno completo | `claw report triage`, quality metadata, dedupe candidates, receipts, approvals, validation plans; tests in `packages/clawjs/src/cli-report.test.ts`. |
| 2 | Issues + Discussions | Destinations `github_issue`, `github_discussion_ideas`, `github_discussion_feedback`; docs in `docs/agent-rules/reporting.md`; routing tests. |
| 3 | Cuenta del usuario | `publicationIdentity()` records `user_github_account`, broker `claw-secret-broker`, and redacted token field; dry-run test covers it. |
| 4 | Opt-in por adjunto | Attachments persist basename only and require opt-in; preview test proves full paths are omitted. |
| 5 | Bloquear público | Security drafts route to `private_security_advisory`; schema rejects `public_security_issue`; submit blocks public privacy paths. |
| 6 | Comentar en canónico | Dedupe sets `comment_on_canonical` and connector operation `github.action.create-issue-comment`; tests cover dry-run and fake server execution. |
| 7 | Discussions canónicas | Features route to `Ideas`, UX feedback and broad translation requests route to `Feedback`; global search can propose canonical Issues/Discussions. |
| 8 | ClawJS + Clawix | `--repo clawjs|clawix` controls repository values in draft, list, and submission plan. |
| 9 | Solo propuesta PR | `pr_proposal` emits `proposal_only.no_github_mutation`; live execution throws `pr_proposal_only`. |
| 10 | Bloquear publicación | Low-evidence reports receive `NOT_ENOUGH_INFO` and cannot submit. |
| 11 | Dirigida y segura | `claw report check` emits local safe checks, prohibited checks, and `EXTERNAL PENDING` items. |
| 12 | Recomendar + label | `claw report triage` returns recommendations, labels, comments, and `destructiveActionsAllowed: false`. |
| 13 | Hashes salados locales | State includes local `fingerprintSalt`; fingerprints are used for dedupe and not published as machine ids. |
| 14 | Connector Claw | `submit` builds Claw GitHub connector plans and `--execute` uses `@clawjs/integrations`, not `gh`. |
| 15 | Rica pero cerrada | `REPORT_LABELS` and `claw report templates` expose the closed taxonomy; tests cover labels and categories. |
| 16 | ADR + agent-rules | ADR `docs/adr/0011-report-governance-v1.md`, `docs/agent-rules/reporting.md`, and constitutional principle `IV.5`. |
| 17 | Ideas + Feedback | `REPORT_DISCUSSION_CATEGORIES` is exactly `Ideas`, `Feedback`; tests assert this. |
| 18 | Host + CLI preview | CLI preview and confirmation are required. Live execution requires `--host-approval-id`; physical signed-host UI/audit is `EXTERNAL PENDING`. |

Additional V1 closure items:

- Global dedupe uses connector-backed search for canonical Issues and
  Discussions; only local salted fingerprints are stored for local grouping.
- `claw report github bootstrap` verifies labels, templates, Discussions, and
  private security setup; safe label apply is connector-backed and confirmed.
- `export`, `delete`, and `prune` provide manual retention with redaction and
  confirmation.
- `budget status|reset|override` records local anti-spam budget state and
  auditable human overrides.

Primary validation commands:

- `npm --workspace @clawjs/core run build`
- `npm --workspace @clawjs/integrations run build`
- `npm --workspace @clawjs/cli run build`
- `npm exec vitest -- run packages/clawjs-core/src/schemas-report.test.ts`
- `npm exec vitest -- run packages/clawjs/src/cli-report.test.ts`
- `npm exec vitest -- run packages/clawjs-integrations/src/github-operation-executor.test.ts`
- `npm run test:policy`
- `npm run test:docs`
