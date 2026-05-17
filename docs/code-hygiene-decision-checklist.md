# Code Hygiene Decision Checklist

Source conversation: `019e2bee-b635-7c51-b569-bd31b3cca875`

This checklist is required before the code hygiene goal can be closed. Every
decision must be marked `implemented`, `validated`, `documented`, or `blocked`
with concrete evidence.

| Decision | Required answer | Status | Evidence |
| --- | --- | --- | --- |
| `strictness` | Fallar solo lo claro | documented | ADR 0016 and `code-hygiene-check` bootstrap. |
| `scope` | Clawix + ClawJS | documented | ADR 0016 and mirrored Clawix artifacts. |
| `enum_policy` | Conservar si son canon | documented | ADR 0016 report-only semantic policy. |
| `rollout_model` | Limpiar todo primero | blocked | Cleanup campaign is pending. |
| `baseline_governance` | Motivo + caducidad | implemented | Baseline schema and checker require expiry metadata. |
| `autofix_policy` | Solo sugerir cambios | documented | Audit/cleanup skills prohibit default destructive autofix. |
| `export_policy` | API publica se conserva | partially implemented | ADR 0016 public contract retention rule; ClawJS built-in family barrels are retained via expiring public-API baseline; reviewed Discord test catalog, Secrets crypto/shared DTOs, secrets plugin helper types/session cache store/server helpers, Notify auth/subscription/surface helpers, Wiki auth/access-policy helpers, bridge server/platform/job-handler helpers, Memory CLI/workspace/type helpers, ERP shared contract/db helper internals, provider-local integration runtime/source aliases, Publishing CLI/config/db/id/app helpers, Execution shared DTOs/security/worker helpers, IoT tool registry/adapter helpers, Monitor config/schema helpers, Drive CLI/auth/realtime helpers, Feed auth helpers, Content form helper types, ClawJS node runtime/OpenClaw/secrets/Telegram/rules/schema helpers, Claw CLI/domain/open/reference/style/template/data helpers, Workspace/delegation/runtime helper internals, Drive/browser/relay/plugin helpers, Bridge/Relay shutdown and pairing follow-up, Publishing schema/channel helpers, Apps store helpers, private shared DTO aliases, integration runtime helper exports, CLI JSON helper wrappers, runtime plugin bridge helpers, CLI runtime metadata helpers, project scaffold helpers, scaffold execution helpers, chat CLI helpers, report-governance helpers, memory CLI helpers, audio catalog legacy naming, database CLI/store-helper, v1 data wrapper/core, slides, database magic, style schema, agent plan, time logic, and Relay protocol internals were made private without changing package contracts. |
| `unused_files` | Entrypoints configurados primero | implemented | Knip config declares explicit entry/project scope, includes tool configs/scripts/seeds/public JS/CSS assets, templates, website assets, tests, generated fixtures, and top-level app/module workspaces; reviewed unused ClawJS file findings were deleted or calibrated and Knip file findings are zero. |
| `dependency_policy` | Normalizar por workspace | implemented | Removed clear unused ClawJS workspace dependencies (`chokidar`, profile `@noble/hashes`, reviewed app/database/module direct dependencies), moved root VitePress/Vue ownership to `website`, declared direct root `tsx` usage, calibrated the Vitest coverage provider, mapped top-level app/module package manifests with explicit entry/project shapes, and reduced dependency/devDependency findings to zero; the only remaining unlisted findings are reviewed dynamic-runtime baseline entries. |
| `swift_tooling` | Periphery calibrado | partially implemented | Periphery 3.7.4 runner and report pair exist with Swift retention flags; local binary install remains `EXTERNAL PENDING`. |
| `swift_public` | Conservar como contrato | documented | ADR 0016 public Swift retention rule. |
| `swiftui_dynamic` | Retener por patron | documented | ADR 0016 semantic report-only rule. |
| `semantic_placeholders` | Issue/backlog o ADR | documented | ADR 0016 future-intent rule. |
| `enum_members` | Report-only con canon | documented | ADR 0016 semantic report-only rule. |
| `todo_policy` | Si, con categorias | partially implemented | Report-only `code-hygiene-audit` scans TODO/FIXME/HACK/XXX and records categories; cleanup classification pending. |
| `duplication_scope` | Codigo + assets obvios | partially implemented | Report-only `code-hygiene-audit` detects byte-identical duplicate assets; code duplicate scan pending. |
| `duplicate_severity` | Report-only al inicio | documented | ADR 0016 semantic report-only rule. |
| `asset_policy` | Eliminar si no referenciado | partially implemented | Report-only audit now detects duplicate assets and unreferenced asset candidates; removal remains pending cleanup review. |
| `test_code_policy` | Si, pero con fixtures protegidas | documented | Cleanup skill procedure. |
| `generated_policy` | Manifest + marcadores | documented | ADR 0016 generated/vendor rule. |
| `docs_references` | Solo docs canonicas | documented | ADR 0016 public/canonical retention rule. |
| `cleanup_batching` | Por categoria y repo | documented | Cleanup skill procedure. |
| `ci_gate` | Changed + release | partially implemented | ClawJS changed lane calls hygiene check and ClawJS release workflow runs `test:release` plus publish dry-run; Clawix release proof remains pending. |
| `report_format` | JSON + Markdown | implemented | `docs/code-hygiene-report.json` and `.md`. |
| `skill_shape` | Dos skills | implemented | `code-hygiene-audit`, `code-hygiene-cleanup`. |
| `skill_location` | ClawJS y proyectada | partially implemented | ClawJS canonical skills exist; Clawix projection exists pending full repo validation. |
| `recurrence` | Cada campana + pre-release | documented | ADR 0016 and ledger; automation cadence pending. |
| `ledger` | Si, compacto | implemented | `docs/code-hygiene-ledger.md`. |
| `expiry_window` | 90 dias | implemented | Baseline default and checker. |
| `cleanup_safety` | Checks verdes por lote | documented | Cleanup skill procedure. |
| `knip_install` | Dev dependency fija | implemented | Package metadata, lockfile, Knip config, exact-version runner, and report-only summary. |
| `periphery_install` | Tool versionada | partially implemented | Periphery is pinned to 3.7.4 with a report-only runner and explicit external pending until the binary is installed. |
| `new_deps_policy` | Solo herramientas justificadas | documented | Tool registry and ADR 0016. |
