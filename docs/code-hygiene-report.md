# Code Hygiene Report

Status: ACTIVE.

- Blocking findings: 0 after initial cleanup.
- Report-only findings: 24 in the latest local audit summary.
- Baselined findings: 3 baseline entries covering reviewed ClawJS built-in family barrel and dynamic-runtime findings.
- Initial cleanup completed: actionable TODO/FIXME/HACK/XXX findings and unreferenced asset candidates are zero; remaining duplicate assets are report-only.
- Report-only audit command: `node scripts/code-hygiene-audit.mjs`.
- Report-only Knip command: `node scripts/code-hygiene-knip.mjs`.
- Report-only Periphery command: `node scripts/code-hygiene-periphery.mjs`.
- Completion audit: `docs/code-hygiene-completion-audit.md` records the one-by-one decision review.
- Latest audit summary: 6,926 files scanned; 0 TODO/FIXME/HACK/XXX findings; 24 duplicate asset groups covering 65 files; 0 unreferenced asset candidates.
- Latest Knip summary: 64 files with issues; 584 total findings after removing clear unused workspace dependencies, normalizing root VitePress/Vue/tsx ownership, calibrating entry/project ownership for templates/public CSS/website assets/generated fixtures, removing reviewed dead one-line stubs and retired CLI bin shims, reducing Discord test catalog, Secrets crypto/shared DTOs, secrets plugin helper types/session cache store/server helpers, Notify auth/subscription/surface helpers, Wiki auth/access-policy helpers, Bridge server/platform/job-handler helpers, Bridge Iroh remote endpoint type exposure, Memory CLI/workspace/type helpers, ERP shared contract/db helper internals, provider-local integration runtime/source aliases, Publishing CLI/config/db/id/app helpers, Execution shared DTOs/security/worker helpers, IoT tool registry/adapter helpers, Monitor config/schema helpers, Drive CLI/auth/realtime helpers, Feed auth helpers, Content form helper types, ClawJS node runtime/OpenClaw/secrets/Telegram/rules/schema helpers, Claw CLI/domain/open/reference/style/template/data helpers, Workspace/delegation/runtime helper internals, Drive/browser/relay/plugin helpers, Bridge/Relay shutdown and pairing follow-up, Publishing schema/channel helpers, Apps store helpers, private shared DTO aliases, integration runtime helper exports, CLI JSON helper wrappers, runtime plugin bridge helpers, CLI runtime metadata helpers, project scaffold helpers, chat CLI helpers, report-governance helpers, memory CLI helpers, audio catalog legacy naming, database CLI/store-helper, v1 data wrapper/core, slides, database magic, style schema, agent plan, time logic, and Relay protocol helper exports to externally imported APIs only, reducing dependency/devDependency/file findings to zero, and keeping reviewed dynamic runtime findings baselined.
- Latest Periphery summary: external pending; 2 Swift packages discovered; Periphery 3.7.4 binary not installed on PATH.

This report is the human-readable pair for `docs/code-hygiene-report.json`.
