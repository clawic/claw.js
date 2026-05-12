---
title: Project Tracking
description: Portfolio-level progress tracker for ClawJS areas, projects, and pending work.
---

# Project Tracking

Use this section as the canonical place to track what is active, what is done, and what is still pending across the repository.

## Status Legend

| State | Meaning |
| --- | --- |
| `planned` | Defined and queued, but not started yet. |
| `in_progress` | Actively being worked on. |
| `blocked` | Waiting on a dependency or decision. |
| `done` | Completed and no longer pending for the current cycle. |

## Working Rules

1. Keep one row per area or project in the overview.
2. Break real deliverables into the detailed backlog, not into the overview.
3. Update the `Updated` column whenever state, scope, or next step changes.
4. Move rows to `done` only when the work is actually shipped or closed.

## Portfolio Overview

| Area | Project | Current focus | State | Done recently | Pending next | Owner | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Repository | Tracking | Keep one shared project tracker for the whole repo | `done` | Tracking section created and linked in docs | Start filling each area backlog with concrete deliverables | - | 2026-04-16 |
| Runtime surfaces | SDK + CLI | Keep the main local SDK and CLI surface aligned | `in_progress` | Core runtime, workspace, auth, sessions, files, and docs surfaces are already documented | Capture remaining gaps and release blockers in the backlog | - | 2026-04-16 |
| Product shells | Demo app | Keep the demo as the main hermetic validation surface | `in_progress` | Main onboarding, chat, settings, workspace, tools, and system flows already have E2E coverage | Add missing edge-flow backlog items here as they appear | - | 2026-04-16 |
| Documentation | Docs website | Keep public docs aligned with the real repository surface | `in_progress` | Docs site already covers setup, runtime, workspace, CLI, API, and service docs | Use the backlog page to track doc drift, gaps, and follow-up pages | - | 2026-04-16 |
| Service stack | Relay | Track remote control-plane work separately from the local SDK | `planned` | Baseline repo area and public docs already exist | Seed the first relay-specific backlog entries | - | 2026-04-16 |
| Service stack | Database | Track namespace database work as its own stream | `planned` | Baseline repo area and public docs already exist | Seed the first database-specific backlog entries | - | 2026-04-16 |
| Service stack | Time | Track temporal control-plane work independently | `planned` | Baseline repo area and public docs already exist | Seed the first time-specific backlog entries | - | 2026-04-16 |
| Service stack | ERP | Track ERP backend work independently from the rest of the repo | `planned` | Baseline repo area and public docs already exist | Seed the first ERP-specific backlog entries | - | 2026-04-16 |
| Service stack | Content | Track content control-plane work as a separate stream | `planned` | Baseline repo area and public docs already exist | Seed the first content-specific backlog entries | - | 2026-04-16 |
| Service stack | Notify | Track notification delivery work independently | `planned` | Baseline repo area and public docs already exist | Seed the first notify-specific backlog entries | - | 2026-04-16 |
| Service stack | IoT | Track IoT control-plane work independently | `planned` | Baseline repo area and public docs already exist | Seed the first IoT-specific backlog entries | - | 2026-04-16 |
| Service stack | Secrets | Track secret-broker work independently | `planned` | Baseline repo area and public docs already exist | Seed the first secrets-specific backlog entries | - | 2026-04-16 |
| Service stack | Drive | Track drive product work independently | `planned` | Baseline repo area and public docs already exist | Seed the first drive-specific backlog entries | - | 2026-04-16 |
| Service stack | Execution Plane | Track execution-plane work independently | `planned` | Baseline repo area and public docs already exist | Seed the first execution-plane-specific backlog entries | - | 2026-04-16 |

## Detailed Backlog

Use the detailed page for real deliverables, blockers, and follow-up items:

- [Tracking backlog](/tracking/backlog)

## Recommended Review Cadence

- During planning: add or update rows before work starts.
- During execution: refresh `State`, `Pending next`, and `Updated`.
- During review: move completed work to `done` and archive stale items elsewhere if needed.
