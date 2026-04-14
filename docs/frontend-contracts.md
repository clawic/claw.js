# Frontend Contracts

## Primary Endpoints

| Endpoint | Method | Returns | Notes |
| --- | --- | --- | --- |
| `/api/companies` | `GET` | `{ companies }` | Organization selector rail |
| `/api/companies` | `POST` | onboarding seed payload | Creates organization + portfolio seed |
| `/api/companies/:companyId` | `GET` | `CompanyDetailPayload` | Main aggregate for dashboard and shell |
| `/api/companies/:companyId/portfolios` | `GET, POST` | `{ portfolios }`, `{ portfolio }` | Portfolio CRUD v1 |
| `/api/companies/:companyId/portfolio-items` | `GET, POST` | `{ portfolioItems }`, `{ portfolioItem }` | Managed units |
| `/api/companies/:companyId/issues` | `GET, POST` | `{ issues }`, `{ issue }` | Work items |
| `/api/companies/:companyId/releases` | `GET, POST` | `{ releases }`, `{ release }` | Launch and update planning |
| `/api/companies/:companyId/operational-checks` | `GET, POST` | `{ operationalChecks }`, `{ operationalCheck }` | Health signals |
| `/api/companies/:companyId/operational-incidents` | `GET, POST` | `{ operationalIncidents }`, `{ operationalIncident }` | Incident queue |
| `/api/companies/:companyId/feedback` | `GET, POST` | `{ feedbackItems }`, `{ feedback }` | Signal intake |
| `/api/companies/:companyId/metrics/imports` | `GET, POST` | `{ imports }`, `{ importBatch }` | Manual imports |
| `/api/companies/:companyId/summary/recompute` | `POST` | `{ summary }` | Force refresh |
| `/api/companies/:companyId/fixtures` | `GET` | fixture bundle | Development helper for UI |
| `/api/feedback/:feedbackId/triage` | `POST` | triage result | Creates issue optionally |
| `/api/incidents/:incidentId/resolve` | `POST` | resolve result | May create approval instead |
| `/api/releases/:releaseId/ship` | `POST` | `{ release }` | Marks release as released |

## DTOs

- `CompanyDetailPayload`
- `ExecutiveSummary`
- `PortfolioListItem`
- `PortfolioItemOverview`
- `OperationsBoard`
- `FeedbackQueue`
- `ReleaseBoard`

## Action Semantics

| Action | Meaning |
| --- | --- |
| `triage` | Convert signal into categorized work |
| `create_issue` | Materialize tracked work |
| `resolve` | Resolve operational incident |
| `approve` | Review sensitive action |
| `run_agent` | Trigger agent execution |
| `ship_release` | Mark release as shipped |
| `open_incident` | Materialize incident record |
| `request_approval` | Ask board for sensitive change |
| `recompute_summary` | Force refresh aggregate view |

## Required Frontend Rule

- If an action is not in `availableActions`, the UI must not render it as enabled.
