# Frontend Checklist

This document is the implementation contract for the future SPA in `erp/ui/`.
The frontend must not infer business rules from database shapes. It consumes:

- `/v1/app/*` for read models
- `/v1/*` for commands and mutations
- `erp/docs/api-openapi.json` for route inventory
- `erp/docs/fixtures/*.json` for frozen payload references

## 1. Global Shell

- Render a persistent shell on every authenticated route.
- Required shell controls:
  - `data-testid="shell-tenant-selector"`
  - `data-testid="shell-legal-entity-selector"`
  - `data-testid="shell-branch-switcher"`
  - `data-testid="shell-global-search"`
  - `data-testid="shell-inbox"`
  - `data-testid="shell-approvals"`
  - `data-testid="shell-alerts"`
  - `data-testid="shell-profile"`
  - `data-testid="shell-command-palette"`
  - `data-testid="shell-breadcrumbs"`
  - `data-testid="shell-sync-status"`
  - `data-testid="shell-job-status"`
  - `data-testid="shell-localization-badge"`
- Sync state must visually differentiate:
  - healthy
  - stale
  - offline
  - reconnecting
- Jobs widget must show:
  - job id
  - job kind
  - progress
  - current message
  - final result CTA

## 2. Universal Screen Rules

- Every list screen must implement:
  - URL-persisted filters
  - stable server-side sort
  - total counter
  - selectable rows
  - bulk actions
  - export action
  - saved views
  - empty state
  - loading skeleton
  - inline error block
  - retry CTA
  - per-row permission indicators
- Every detail screen must implement:
  - status badge in header
  - document number in header
  - primary actions bar
  - summary card
  - fixed tabs: `overview`, `timeline`, `audit`, `attachments`, `approvals`
  - agent actions area
  - related tasks/issues card
  - comments area
- Every destructive or regulated action must:
  - open confirm dialog
  - render exact impact preview from backend `effects`
  - render policy/approval warning text
  - block submit until explicit confirmation
- Every screen must support:
  - manual refresh
  - realtime revalidation
  - recovery after reload
  - restoration from deep-linked URL state

## 3. Dashboard

- Route: `/dashboard`
- Payload source: `/v1/app/dashboard`
- Mandatory cards:
  - `dashboard-cash-card`
  - `dashboard-ar-aging-card`
  - `dashboard-ap-aging-card`
  - `dashboard-revenue-card`
  - `dashboard-margin-card`
  - `dashboard-overdue-approvals-card`
  - `dashboard-inventory-alerts-card`
  - `dashboard-production-bottlenecks-card`
  - `dashboard-payroll-calendar-card`
  - `dashboard-open-tickets-card`
- Mandatory feed:
  - `dashboard-activity-feed`
- Mandatory secondary sections:
  - stock positions snapshot
  - jobs in progress
  - latest approvals

## 4. Finance

- Routes required:
  - `/finance/accounts`
  - `/finance/journals`
  - `/finance/entries`
  - `/finance/entries/:entryId`
  - `/finance/periods`
  - `/finance/taxes`
  - `/finance/banks`
  - `/finance/reconciliation`
  - `/finance/assets`
  - `/finance/close`
- Entry detail requirements:
  - lines grid
  - debit/credit totals
  - posting source
  - reversal CTA
  - audit trail
- Period close screen requirements:
  - open periods list
  - blockers list
  - irreversible action warning
  - success receipt block with timestamp

## 5. Sales

- Routes required:
  - `/sales/leads`
  - `/sales/opportunities`
  - `/sales/accounts`
  - `/sales/contacts`
  - `/sales/quotes`
  - `/sales/orders`
  - `/sales/shipments`
  - `/sales/invoices`
  - `/sales/subscriptions`
- Quote list requirements:
  - status filter
  - amount range filter
  - owner filter
  - create CTA
  - convert-to-order bulk action
- Quote form requirements:
  - exact schema from `/v1/app/forms/sales.quote.create`
  - no field label invention
  - no ad hoc validation copy

## 6. Purchase

- Routes required:
  - `/purchase/vendors`
  - `/purchase/requests`
  - `/purchase/orders`
  - `/purchase/receipts`
  - `/purchase/bills`
  - `/purchase/payments`
  - `/purchase/vendor-performance`
- Receipt detail must show:
  - warehouse
  - received lines
  - inventory effect
  - accrual effect

## 7. Inventory

- Routes required:
  - `/inventory/items`
  - `/inventory/variants`
  - `/inventory/uom`
  - `/inventory/lots`
  - `/inventory/serials`
  - `/inventory/warehouses`
  - `/inventory/locations`
  - `/inventory/movements`
  - `/inventory/valuation`
  - `/inventory/counts`
  - `/inventory/reorder-rules`
- Mandatory list fields:
  - SKU
  - description
  - warehouse
  - on hand
  - reserved
  - available
  - average cost
  - last movement date

## 8. Manufacturing

- Routes required:
  - `/mrp/boms`
  - `/mrp/routings`
  - `/mrp/work-centers`
  - `/mrp/orders`
  - `/mrp/consumption`
  - `/mrp/production`
  - `/mrp/quality`
  - `/mrp/maintenance`
- Order detail must show:
  - input lines
  - output lines
  - variance summary
  - WIP and inventory effects

## 9. Projects

- Routes required:
  - `/projects/portfolio`
  - `/projects/list`
  - `/projects/tasks`
  - `/projects/milestones`
  - `/projects/timesheets`
  - `/projects/profitability`
  - `/projects/billing`
- Profitability page must render:
  - revenue
  - cost
  - margin
  - billed hours
  - unbilled hours

## 10. HR

- Routes required:
  - `/hr/employees`
  - `/hr/structure`
  - `/hr/contracts`
  - `/hr/leave`
  - `/hr/attendance`
  - `/hr/documents`
  - `/hr/reviews`
- Employee detail must include:
  - identity card
  - contract summary
  - attendance summary
  - leave balance
  - payroll link

## 11. Payroll

- Routes required:
  - `/payroll/calendar`
  - `/payroll/runs`
  - `/payroll/payslips`
  - `/payroll/incidents`
  - `/payroll/postings`
  - `/payroll/close`
- Run detail must include:
  - gross/net totals
  - employee count
  - posting status
  - re-run blockers

## 12. Support

- Routes required:
  - `/support/queue`
  - `/support/tickets`
  - `/support/sla`
  - `/support/macros`
  - `/support/knowledge-links`
- Queue screen must show:
  - SLA risk badge
  - assignee
  - last reply
  - customer
  - source channel

## 13. DMS

- Routes required:
  - `/dms/libraries`
  - `/dms/documents`
  - `/dms/versions`
  - `/dms/permissions`
  - `/dms/signatures`
  - `/dms/retention`
- Document detail must show:
  - owning business entity
  - current version
  - previous versions
  - retention rule
  - signature status

## 14. BI

- Routes required:
  - `/bi/dashboards`
  - `/bi/metrics`
  - `/bi/views`
  - `/bi/drilldown`
  - `/bi/export`
- Drilldown must preserve source filters in URL.

## 15. Admin

- Routes required:
  - `/admin/users`
  - `/admin/roles`
  - `/admin/policies`
  - `/admin/localizations`
  - `/admin/numbering`
  - `/admin/templates`
  - `/admin/integrations`
  - `/admin/agents`
  - `/admin/settings`
- Policies page must show:
  - actor type
  - action family
  - threshold
  - approval requirement
  - escalation target

## 16. Form Rules

- Backend schema is canonical.
- Form engine must support:
  - field order
  - groups
  - defaults
  - placeholders
  - help text
  - required markers
  - visibility rules
  - read-only rules
  - mask rules
  - field-level errors
  - form-level error block
- All submit flows must surface:
  - returned entity header
  - returned `effects`
  - returned `allowedActions`

## 17. Status Rendering

- `draft`: gray badge, edit + approve enabled.
- `approved`: amber badge, post enabled.
- `confirmed`: blue badge, execute next operational step enabled.
- `posted`: green badge, reverse/settle enabled.
- `settled`: solid green badge, no mutation except reopen by policy.
- `reversed`: red outline badge, show source reversal link.
- `cancelled`: muted badge, show cancellation reason block.

## 18. Exact Test IDs

- Every list root: `*-table`
- Every create CTA: `*-create`
- Every filter bar: `*-filters`
- Every primary detail header: `*-header`
- Every audit tab: `*-audit-tab`
- Every approvals tab: `*-approvals-tab`
- Every confirm modal: `confirm-modal`
- Every job banner: `job-status-banner`
- Every sync badge: `sync-status-badge`

## 19. Acceptance Criteria

- No business rule is duplicated from backend in frontend code.
- Every visible screen maps to a documented route and read model.
- Every visible action maps to a documented command endpoint.
- Every list/detail has stable `data-testid` coverage.
- Every confirm flow shows backend-provided impact preview.
- Every long-running action surfaces job status and resumability.
