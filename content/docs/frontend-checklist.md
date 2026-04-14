# Frontend Checklist

This document is the implementation contract for the future SPA in `content/ui/`.
The frontend must not infer business rules from database shapes. It consumes:

- `/v1/app/*` for read models
- `/v1/*` for commands and mutations
- `content/docs/api-openapi.json` for route inventory
- `content/docs/fixtures/*.json` for frozen payload references

## 1. Global Shell

- Render a persistent shell on every authenticated route.
- Required shell controls:
  - `data-testid="shell-brand-selector"`
  - `data-testid="shell-destination-scope"`
  - `data-testid="shell-calendar-range"`
  - `data-testid="shell-global-search"`
  - `data-testid="shell-command-palette"`
  - `data-testid="shell-approvals"`
  - `data-testid="shell-jobs"`
  - `data-testid="shell-sync-status"`
  - `data-testid="shell-profile"`
  - `data-testid="shell-breadcrumbs"`
- Sync state must visually differentiate:
  - healthy
  - stale
  - offline
  - reconnecting
- Jobs widget must show:
  - plan id
  - destination label
  - current phase
  - progress message
  - retry or inspect CTA

## 2. Universal Screen Rules

- Every list screen must implement:
  - URL-persisted filters
  - server-driven sort
  - total counter
  - selectable rows
  - bulk actions only when backend exposes them
  - empty state
  - loading skeleton
  - inline error block
  - retry CTA
  - deep-linkable saved view state
- Every detail screen must implement:
  - status badge in header
  - primary actions bar
  - summary card
  - tabs: `overview`, `timeline`, `approvals`, `attachments`, `runs`
  - comments area placeholder fed only by backend contracts
  - agent actions area
- Every destructive or regulated action must:
  - open confirm dialog
  - render backend-provided impact preview
  - render policy warning text
  - block submit until explicit confirmation
- Every screen must support:
  - manual refresh
  - realtime revalidation
  - restoration from deep-linked URL state
  - optimistic loading only where backend declares concurrency token or revision

## 3. Required Routes

- `/dashboard`
- `/calendar`
- `/pipeline`
- `/entries`
- `/entries/:entryId`
- `/composer/:entryId`
- `/campaigns`
- `/destinations`
- `/approvals`
- `/publications`
- `/settings/adapters`

## 4. Dashboard

- Route: `/dashboard`
- Payload source: `/v1/app/dashboard`
- Mandatory cards:
  - `dashboard-drafts-card`
  - `dashboard-scheduled-card`
  - `dashboard-published-card`
  - `dashboard-failed-card`
  - `dashboard-pending-approvals-card`
  - `dashboard-destination-health-card`
  - `dashboard-assets-card`
  - `dashboard-campaigns-card`
- Mandatory feed:
  - `dashboard-activity-feed`
- Mandatory secondary sections:
  - next 7 days calendar strip
  - latest failed publications
  - queued plans

## 5. Calendar

- Route: `/calendar`
- Payload source: `/v1/app/calendar`
- Mandatory modes:
  - month
  - week
  - agenda
- Mandatory controls:
  - grouping by brand
  - grouping by destination
  - status legend
  - publish policy legend
  - conflict filter
- Calendar items must visually encode:
  - entry status
  - approval state
  - destination kind
  - autopublish blocked by policy
- Drag-reschedule rules:
  - only enabled when backend reports `canReschedule=true`
  - show ghost card with exact destination and status
  - confirm change when policy impact changes

## 6. Pipeline

- Route: `/pipeline`
- Mandatory columns:
  - `draft`
  - `review`
  - `approved`
  - `scheduled`
  - `failed`
  - `published`
- Cards must show:
  - title
  - brand
  - destination summary
  - asset count
  - last update
  - blocking validation count
- Filters must persist in URL:
  - brand
  - destination
  - campaign
  - status
  - owner

## 7. Entries

- `/entries` is the master list.
- It must render:
  - status filter
  - brand filter
  - campaign filter
  - destination coverage badge
  - revision number
  - asset count
  - create entry CTA
- `/entries/:entryId` must render:
  - canonical content card
  - revision history
  - asset strip
  - linked variants table
  - linked approvals
  - linked publication runs

## 8. Composer

- Route: `/composer/:entryId`
- Payload source: `/v1/app/composer/:entryId`
- Layout is fixed to three panels:
  - left rail: entry metadata, campaign, assets, approval summary
  - center canvas: canonical editor and variant tabs
  - right rail: capabilities, validations, preview and publish controls
- Mandatory areas:
  - canonical editor with title, summary and body
  - variant tab bar with destination icon, status and unsaved marker
  - preview frame that switches by destination kind
  - validation panel grouped by `errors`, `warnings`, `capabilities`
  - asset tray with drag order and alt text editing
  - approval state card
  - fixed publish bar with `save`, `request approval`, `schedule`, `publish now`
- Concurrency:
  - dirty state badge is mandatory
  - save conflicts must render revision mismatch banner
  - do not merge locally; ask backend for latest payload and show diff

## 9. Destinations

- Route: `/destinations`
- Payload source: `/v1/app/destinations`
- Each destination card must show:
  - name
  - kind
  - brand
  - publish policy
  - health badge
  - secret status
  - capability badges
  - test connection CTA
- Capability badges must map exactly to backend metadata. No frontend-derived collapsing.

## 10. Approvals

- Route: `/approvals`
- Payload source: `/v1/app/approvals`
- Queue rows must show:
  - requested at
  - requester
  - entry
  - destination
  - policy reason
  - diff available badge
- Detail panel must show:
  - current revision vs approved revision diff
  - impact preview by destination
  - approve CTA
  - reject CTA
  - rejection comment required

## 11. Publications

- Route: `/publications`
- Payload source: `/v1/app/publications`
- Mandatory list fields:
  - run id
  - entry title
  - destination
  - status
  - attempt number
  - external id
  - started at
  - completed at
- Detail screen must show:
  - provider timeline
  - error envelope exactly as backend returns it
  - retry CTA when backend says `canRetry=true`
  - destination snapshot used in the run

## 12. Form Rules

- Consume only:
  - `/v1/app/forms/entry.create`
  - `/v1/app/forms/variant.edit`
  - `/v1/app/forms/destination.create`
  - `/v1/app/forms/publish-plan.create`
- Do not invent:
  - labels
  - placeholders
  - validation copy
  - default values
  - hidden business rules

## 13. Required Test IDs

- Dashboard:
  - `content-dashboard`
  - `dashboard-drafts-card`
  - `dashboard-pending-approvals-card`
- Calendar:
  - `content-calendar`
  - `calendar-view-switcher`
  - `calendar-grouping-control`
- Pipeline:
  - `content-pipeline`
  - `pipeline-column-draft`
  - `pipeline-column-scheduled`
- Entries:
  - `content-entry-list`
  - `entry-create-cta`
  - `entry-row`
- Composer:
  - `content-composer`
  - `composer-canonical-editor`
  - `composer-variant-tabs`
  - `composer-preview`
  - `composer-validation-panel`
  - `composer-publish-bar`
- Destinations:
  - `content-destinations`
  - `destination-card`
  - `destination-test-connection`
- Approvals:
  - `content-approvals`
  - `approval-row`
  - `approval-approve-cta`
  - `approval-reject-cta`
- Publications:
  - `content-publications`
  - `publication-row`
  - `publication-retry-cta`

