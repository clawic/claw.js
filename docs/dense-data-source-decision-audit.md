# Dense Data Source Decision Audit

Source conversation: `019e35a1-06bb-77f2-a712-92ed2646bd15`

Reference plan item: `019e3659-0335-7811-9cda-c9d176e91515-plan`

This audit enumerates the unique decision-bearing user messages from the source
conversation. The private JSONL stores some user turns twice, once as a
`response_item` and once as an `event_msg`; duplicate transport copies are
collapsed here, while corrections and interruptions that changed the plan are
kept as separate decision rows.

| ID | Source user turn | Decision or correction | Implementation/docs/tests evidence | Status before final close |
| --- | --- | --- | --- | --- |
| DQ-001 | Initial medical/research database prompt | Build a deep data-structure expansion that balances breadth with non-chaotic simplicity: no meaningless field sprawl, no duplicated relations, and enough structure for medicine/research-like domains. | `clawDenseDataOsRegistry`, `builtins/data_foundation`, ADR 0021, decision map, catalog metadata tests, dense registry tests. | In progress: more pack-specific depth and semantic execution still required. |
| DQ-002 | Initial prompt | Use medicine as an example, but generalize to any domain with dense relational data and specialized software. | First-wave registry covers health/EHR, research/CTMS, biology, labs/LIMS, legal, ERP, CRM, finance/accounting, education/LMS, HR/HRIS, manufacturing/MES, ops/ITSM, real estate/proptech, insurance, maintenance/CMMS; roadmap covers additional dense software categories. | In progress: roadmap packs are visible but not all graduated. |
| DQ-003 | Initial prompt | The output wanted at that stage was a highly structured, ambitious plan explored through many meaningful questions, not a UI. | Goal file, ADR 0021, CLI-only dense routes, decision matrix. | Implemented for current code direction; final close still requires full acceptance audit. |
| DQ-004 | Follow-up asking for more ambition | Ask many more questions and explore possibilities before designing the plan. | The source session and goal capture this; the implementation plan requires decision review before completion. | Partially satisfied historically; final completion must not skip source-session decision review. |
| DQ-005 | Catalog/CLI concern | A catalog must exist for community/basic and complex graphs of major sectors; it is not enough to have a generic DB. | Built-in catalog, dense systems registry, foundation collections, `inspect dense-data`, `inspect dense-fixtures`, canonical data catalog docs. | In progress: current coverage is broad but not all possible sector packs are graduated. |
| DQ-006 | Catalog/CLI concern | Completeness is measured by CLI intentions such as `patient list`, saving symptoms/medications, and listing a patient’s medications. | `cli-dense-data-command.ts`, `cli-discovery.test.ts`, generated dense intents, `inspect dense-intents`. | In progress: representative first-wave routes are executable; exhaustive professional intent coverage remains open. |
| DQ-007 | Catalog/CLI concern | Before closing, inspect the existing framework carefully to avoid a parallel system that ignores notes, graphs, current catalogs, or similar existing work. | Existing catalog audit, `entity_relations` generalized instead of replaced, reuse of built-ins and `core.sqlite`, ADR 0021. | In progress: audit exists; stricter automated retire/merge gates remain to be added as more surfaces are reset. |
| DQ-008 | CLI naming correction | Direct CLI nouns must work without a domain prefix, for example `claw patient list` without `health`. | Direct dense routes, `patient create/list`, generated dense intents, CLI docs. | Implemented for graduated centers; generated coverage highlights ungraduated workflow gaps. |
| DQ-009 | Interaction correction | The previous questions were not understandable; future decision prompts must be clearer. | This audit records decisions directly instead of relying on ambiguous question batches. | Process requirement, not code-complete; continue using concrete wording. |
| DQ-010 | Interaction correction | The user explicitly asked to continue asking questions at that point. | Source-session audit keeps that correction visible. | Historical process decision; not a repo feature. |
| DQ-011 | Scope correction | Do not proceed case by case when the pattern can be inferred. Apply the same model to 10-20 high-density relational domains. | Generic dense registry, generated intents/views, first-wave systems, roadmap systems, acceptance fixtures. | In progress: pattern is implemented, but not every roadmap domain is graduated. |
| DQ-012 | Three-layer correction | The plan must include all three layers: mega-spec/canon, standards/registry thinking, and implementation. | ADR 0021, decision map, storage boundary, CLI docs, built-in schemas, inspect commands, tests. | In progress: implementation exists for first-wave/foundation; semantic execution and full coverage still open. |
| DQ-013 | Implementation correction | ERP, legal, and similar areas must be implemented at DB/system level, not merely mentioned. | ERP/company/account/deal/invoice routes, legal case/client/evidence routes, HR employee/time-off/review routes, real-estate property/visit/offer/inspection routes, insurance policy routes, maintenance vehicle/appliance routes, ops service/incident routes, first-wave built-ins, fixture records. | In progress: representative DB/system implementation exists; richer pack workflows remain. |
| DQ-014 | Plan-source correction | The user should not need to paste more context; the plan must use all available conversation context and only ask truly specific unresolved questions. | Goal file, source decision audit, decision matrix. | In progress: this audit reduces dependence on memory; final close still needs completion evidence per row. |
| DQ-015 | Goal instruction | Establish the plan as a persistent goal; include the conversation id, goal reference, session reference, and require one-by-one decision review before closing. | Active goal, source decision audit, dense decision matrix. | Implemented as process; do not mark goal complete until all rows are complete or explicitly blocked. |
| DQ-016 | Start instruction | Begin execution after the plan/goal was set. | Implementation commits and current worktree changes. | Ongoing. |
| DQ-017 | Continuation objective | Continue pursuing the full objective without redefining success around a smaller subset. | Current goal context, this audit, active plan. | Ongoing; goal remains active. |
| DQ-018 | Latest continuation | Continue after interruption. | Current implementation resumed from partial diff and validated. | Ongoing. |

## Final-Close Rule

Before this goal can be marked complete, every row above must be updated or
cross-referenced with concrete implementation, docs/canon, tests, and
verification evidence. `scripts/verify-dense-data-goal.mjs` is the public
guard that keeps these source rows present and tied to the dense registry,
matrix, fixtures, semantic views, and external-pending ledger. Rows that are not
code features may close as process requirements only when the final completion
audit shows the process was followed. Rows involving external providers, physical devices, regulated
exports, native permissions, secrets, cost-bearing calls, or real services must
remain `EXTERNAL PENDING` until separately validated.
