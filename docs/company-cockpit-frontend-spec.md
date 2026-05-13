# Company Cockpit Frontend Spec

This document defines the frontend contract for the general organization cockpit backed by `apps/board`.
The storage layer still uses `companies`, but the UI language should treat each record as an organization.

## Ground Rules

- Do not infer business logic in the frontend.
- Render server-provided `summary`, `availableActions`, grouped boards, and counters as-is.
- Use `organization`, `portfolio`, `portfolio item`, `project`, `release`, `operations`, and `feedback` in visible copy.
- Keep the existing app shell structure, but treat current visuals as temporary. This spec is about screen behavior and composition.

## Shared UI Rules

- Loading state: show skeletons for whole screens, not per-cell spinners, unless the action is row-local.
- Empty state: show one empty state per screen section with one primary CTA.
- Error state: show inline error banner at the top of the screen body with retry CTA.
- Filters: persist in URL search params where the screen is filter-heavy.
- Search: debounce 200ms client-side; filter only the loaded dataset for v1.
- Dates: relative in dense lists, absolute in details and tooltips.
- Colors:
  - `green`: healthy / resolved / released
  - `yellow`: at risk / warning / queued
  - `red`: critical / failed / blocked
  - `gray`: unknown / archived / ignored
- Icons:
  - organization: `Building2`
  - portfolio: `BriefcaseBusiness`
  - portfolio item: `Layers3`
  - project: `FolderKanban`
  - goal: `Target`
  - issue: `CircleDot`
  - release: `Rocket`
  - incident: `AlertTriangle`
  - check: `Activity`
  - feedback: `MessageSquareText`
  - approvals: `ShieldCheck`
  - agents: `Bot`

## Screen: Overview

- Endpoint: `GET /api/companies/:companyId`
- Purpose: executive landing screen for one organization.
- Section order:
  1. Page header with organization name and short description.
  2. Primary metrics row using `summary.activeGoals`, `summary.projectsInProgress`, `summary.pendingApprovals`, `summary.runningRuns`.
  3. Executive metrics row using `summary.openIncidents`, `summary.untriagedFeedback`, `summary.plannedReleases`, `summary.itemsAtRisk`.
  4. Recent issues.
  5. Portfolio watch from `summary.healthByItem`.
  6. Pending approvals.
  7. Recent activity from `summary.recentActivity`.
- Required cards:
  - label
  - numeric value
  - one supporting sentence
  - optional deep-link if `href` exists
- Portfolio watch row fields:
  - item name
  - item type
  - health status
  - open incidents
  - open issues
  - available actions
- Acceptance checklist:
  - consumes `summary` directly
  - renders all 8 summary metrics
  - does not recompute counts locally
  - shows one recent activity list with mixed record types

## Screen: Portfolio

- Endpoint: `GET /api/companies/:companyId/fixtures`
- Use `portfolioList`.
- Purpose: grouped view of portfolios and portfolio items.
- Section order:
  1. Header with portfolio count and CTA `New portfolio item`.
  2. Filter bar: status, item type, health, owner, search.
  3. Portfolio groups.
- Each portfolio group shows:
  - portfolio name
  - status
  - item count
  - active projects
  - at-risk items
  - child item rows
- Each portfolio item row shows:
  - name
  - item type
  - lifecycle stage
  - health status
  - priority
  - owner
  - target date
  - available actions
- Empty state copy:
  - title: `No portfolio items yet`
  - CTA: `Create portfolio item`

## Screen: Portfolio Item Detail

- Endpoint: `GET /api/companies/:companyId/fixtures`
- Use `portfolioItemOverview` for the selected item.
- Purpose: operational detail page for one managed unit.
- Layout:
  - left column: item summary, goals, projects
  - center column: releases and incidents
  - right column: checks, metrics, feedback
- Required item header fields:
  - name
  - item type
  - status
  - lifecycle stage
  - health status
  - priority
  - target date
  - owner
- Required tabs or stacked sections:
  - Projects
  - Goals
  - Releases
  - Incidents
  - Checks
  - Feedback
  - Metrics
- Acceptance checklist:
  - no tab computes counts itself
  - action buttons come from `availableActions`
  - incidents and releases deep-link to their boards

## Screen: Work

- Endpoint: `GET /api/companies/:companyId`
- Purpose: one board for goals, projects, issues, and releases.
- Section order:
  1. Goals strip
  2. Projects list
  3. Issues table
  4. Release board
- Issues table columns:
  - identifier
  - title
  - status
  - priority
  - work type
  - source domain
  - assignee
  - linked portfolio item
  - due date
  - available actions
- Release board columns:
  - name
  - release type
  - status
  - planned date
  - released date
  - owner
  - available actions

## Screen: Operations

- Endpoint: `GET /api/companies/:companyId/fixtures`
- Use `operations`.
- Purpose: show live health and incident state.
- Layout:
  - top row metrics: open incidents, failed checks, degraded checks, at-risk items
  - left column: incident queue
  - right column: checks grouped by status
- Incident card fields:
  - title
  - severity
  - status
  - started at
  - linked item or project
  - owner
  - summary
  - available actions
- Check card fields:
  - name
  - domain
  - status
  - severity
  - source type
  - last observed
  - detail

## Screen: Feedback

- Endpoint: `GET /api/companies/:companyId/fixtures`
- Use `feedbackQueue`.
- Purpose: turn external and internal signals into work.
- Filters:
  - status
  - source type
  - sentiment
  - priority
  - owner
  - search by title/body/customer
- Row fields:
  - title
  - source label
  - source type
  - sentiment
  - priority
  - received at
  - linked issue
  - available actions
- Primary row actions:
  - `Triage`
  - `Create issue`
  - `Open linked issue`

## Screen: Agents

- Endpoint: `GET /api/companies/:companyId`
- Purpose: operating roster and autonomy policies.
- Required fields per agent:
  - name
  - title
  - role
  - status
  - adapter type
  - scope type
  - scope id
  - autonomy level
  - watch domains
  - reports to
- Actions:
  - create agent
  - approve pending hire
  - pause agent
  - inspect last runs

## Screen: Approvals

- Endpoint: `GET /api/companies/:companyId`
- Purpose: queue of sensitive decisions.
- Row fields:
  - type
  - reason
  - status
  - requested by
  - decided by
  - decided at
  - payload preview
- Actions:
  - approve
  - reject

## Screen: Settings / Imports

- Endpoint: `GET|POST /api/companies/:companyId/metrics/imports`
- Purpose: manual import surface and data source audit.
- Required blocks:
  - import history table
  - `New import` modal
  - supported import types
  - sample payload help
- Import table fields:
  - type
  - status
  - source label
  - started at
  - finished at
  - created by
  - counts

## Payload Examples

- Full detail fixture: [docs/examples/company-cockpit-fixtures.example.json](./examples/company-cockpit-fixtures.example.json)
- Detail payload example: [docs/examples/company-cockpit-detail.example.json](./examples/company-cockpit-detail.example.json)

## Implementation Checklist For Frontend AI

- Use `/api/companies/:companyId` as the primary source of truth.
- Use `/api/companies/:companyId/fixtures` to develop screens before dedicated detail endpoints exist.
- Treat `availableActions` as authoritative.
- Do not rename API fields client-side.
- Do not hardcode counts, statuses, or status-to-action rules.
- Add stable `data-testid` hooks on all major cards, tables, filters, and primary CTAs.
- Keep loaders and empty states explicit for each screen section.
