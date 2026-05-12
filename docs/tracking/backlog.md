---
title: Tracking Backlog
description: Detailed backlog table for pending, active, blocked, and completed work across ClawJS areas.
---

# Tracking Backlog

This page is the detailed counterpart to the portfolio overview. Use one row per deliverable, blocker, or follow-up that can actually be assigned and closed.

## Backlog Table

| Area | Project | Item | Type | Priority | State | Depends on | Next step | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Repository | Tracking | Create one visible progress tracker for the repository | `ops` | `P1` | `done` | - | Keep using this page as the shared source of truth | 2026-04-16 |
| Repository | Tracking | Seed each major area with its first concrete backlog rows | `ops` | `P1` | `planned` | Tracker created | Review each area and add deliverables, blockers, and owners | 2026-04-16 |
| Runtime surfaces | SDK + CLI | Capture current gaps, blockers, and follow-ups in one place | `research` | `P1` | `planned` | Tracker created | Add rows for packaging, runtime adapters, CLI, and workspace follow-ups | 2026-04-16 |
| Product shells | Demo app | Capture missing demo edge cases and UX gaps | `research` | `P2` | `planned` | Tracker created | Add rows for onboarding, chat, settings, and workspace follow-ups | 2026-04-16 |
| Documentation | Docs website | Track doc drift, missing guides, and stale examples | `docs` | `P2` | `in_progress` | Tracker created | Add rows whenever docs diverge from runtime or package behavior | 2026-04-16 |
| Service stack | Relay | Seed the first relay backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for routing, auth, connectors, and operator UX | 2026-04-16 |
| Service stack | Database | Seed the first database backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for schema, tokens, realtime, and admin flows | 2026-04-16 |
| Service stack | Time | Seed the first time backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for routines, reminders, deadlines, and execution history | 2026-04-16 |
| Service stack | ERP | Seed the first ERP backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for ledger, documents, approvals, and app read models | 2026-04-16 |
| Service stack | Content | Seed the first content backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for entries, variants, approvals, and publication runs | 2026-04-16 |
| Service stack | Notify | Seed the first notify backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for source apps, subscriptions, receipts, and sync feeds | 2026-04-16 |
| Service stack | IoT | Seed the first IoT backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for things, scenes, approvals, and automations | 2026-04-16 |
| Service stack | Secrets | Seed the first secrets backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for secret catalog, policies, brokered requests, and leases | 2026-04-16 |
| Service stack | Drive | Seed the first drive backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for docs, uploads, revisions, previews, and sharing | 2026-04-16 |
| Service stack | Execution Plane | Seed the first execution-plane backlog slice | `research` | `P2` | `planned` | Tracker created | Add rows for runs, workers, artifacts, notebooks, and deployments | 2026-04-16 |

## Column Rules

| Column | Use |
| --- | --- |
| `Area` | Broad stream such as runtime surfaces, docs, or services. |
| `Project` | Concrete product, app, or package family. |
| `Item` | One actionable deliverable or blocker. |
| `Type` | Suggested values: `feature`, `bug`, `docs`, `ops`, `research`. |
| `Priority` | Suggested values: `P0`, `P1`, `P2`, `P3`. |
| `State` | Use the same states as the overview page. |
| `Depends on` | The dependency or decision that blocks the row. |
| `Next step` | The immediate next action, not the full solution. |
| `Updated` | Last meaningful edit in `YYYY-MM-DD`. |
