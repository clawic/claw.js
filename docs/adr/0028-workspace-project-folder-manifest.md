# ADR 0028: Workspace, Project, Folder, And Manifest Boundary

Status: Accepted

Date: 2026-05-18

## Context

Claw has one global framework root and one workspace-local `.claw/` directory,
but the product also needs human projects, agent entry folders, shared
workspaces, direct project sharing, Finder moves/renames, and safe handoff to
tools outside Claw. The same visible folder can be a user's daily working
directory, an agent's start location, and a portable artifact copied to another
machine. Treating every folder as a full workspace would be noisy and slow;
keeping only one invisible global root would make projects hard to recognize,
move, share, and recover.

## Decision

`Workspace` is the isolated context. Switching workspace should feel like a
clean room: sessions, memory, pinned or archived items, project lists, resource
bindings, and defaults do not bleed from another workspace unless explicitly
shared.

`Project` is the collaborable human work scope. A project has a stable
`projectId`, a display name, a primary folder, optional referenced folders, and
resource bindings. A project may exist without an organization. Direct project
grants are valid.

`Folder` is a filesystem locator. Folder path and folder name are mutable and
never grant authority. Moving or renaming a folder must not change the project
identity. Deleting a project record must not delete the folder unless a separate
destructive file action is explicitly requested and approved.

The full `.claw/` directory is reserved for Workspace roots. It is not copied
into every Project folder. A project primary folder gets a small visible
handoff footprint instead:

- `claw.project.json`: universal v1 project manifest.
- `AGENTS.md`: managed adapter-facing project instructions.
- `CLAUDE.md`: shim to `AGENTS.md` and canonical project/framework docs.

`claw.project.json` is a clean v1 manifest, not a v2/legacy compatibility file.
It carries portable project identity, a display name, a stable project id,
manifest schema version, primary-folder intent, optional referenced folders,
detached/attached state, and a workspace binding by workspace id only. It does
not contain secrets, sensitive memory, authority grants, local absolute
private paths beyond the folder locator, or full workspace state.

Referenced folders are locators plus policy, not authority. Each referenced
folder requires explicit read access, write access requires a separate grant,
and referenced folder contents are excluded from sync/share unless the
manifest opts in with an explicit sync policy.

A Finder copy of a project folder is usable but incomplete. On a different
workspace, the copy starts detached until the user attaches it. Duplicate
project ids are handled as one active project plus a detached copy that needs an
explicit attach, fork, or replace decision.

The managed project `AGENTS.md` should help tools outside Claw understand that
the folder belongs to a Claw project and where to look for local instructions.
It may reference the manifest and safe exported context, but it must not copy
secret material, sensitive memory, or hidden workspace authority.

`claw project attach` on an existing folder must preview detected files,
manifest state, generated shims, duplicate ids, and proposed writes before the
user accepts. The same preview requirement applies to migrations that add a
manifest to a folder that predated this ADR.

`Project` default context inherits the active Workspace context unless a
project binding overrides it. Project memory is layered: workspace memory,
project memory, entity/resource memory, and session memory are separate layers
with explicit sharing/forking rules. Shareable resources use multi-scope
bindings with a single source of truth plus detach/fork behavior.

## Surface Parity

- **Human surface**: Clawix sidebar uses project/resource ids as identity and
  paths as mutable locators. It shows active, missing, detached, and duplicate
  states, supports rename without folder rename, and supports folder move/copy
  repair without losing sessions or pins.
- **Programmatic surface**: `claw project inspect|attach|detach|export|sync-handoff`
  expose manifest and project state. Future APIs and MCP surfaces consume the
  same manifest and binding model.
- **Persistence**: Workspace control files live in `.claw/`; project records,
  bindings, resource associations, sessions, chats, pins, archives, and memory
  projections live in `core.sqlite` or approved sidecars. Project folders carry
  only `claw.project.json` and adapter shims.
- **Gaps**: Existing project/sidebar/session code may still key by path. That
  must be migrated to project/resource ids before the goal is complete.
- **Validation**: Tests must cover project rename, folder move, folder copy,
  duplicate manifest ids, missing folder state, attach preview/accept,
  detach/fork, export/import, handoff without secrets, and Clawix sidebar and
  sessions surviving path changes.

## Discovery Route

- **AGENTS/CLAUDE**: `AGENTS.md` routes workspace, storage, project, grants, and
  Clawix integration work to this ADR through `docs/decision-map.md`.
- **Skill**: use `data-storage-boundary-review`, `surface-route-work`, and
  `docs-alignment-update` before changing workspace/project storage or project
  folder handoff.
- **Docs router**: `docs/decision-map.md`, `docs/workspace.md`,
  `docs/data-storage-boundary.md`, and Clawix's decision map point here.
- **CLI**: `claw search project --json`, `claw inspect storage --json`, and
  future `claw project inspect --json` expose the model.
- **Registry**: current routing is protected by the decision map and
  `scripts/governance-scope-guard.mjs`; manifest file-format registry coverage
  must be added with the implementation commands.

## Consequences

This keeps the strong "copy one workspace folder and keep the framework state"
story for full workspaces while also making individual project folders visible,
portable, and usable with external agents. It avoids spraying full `.claw/`
directories through every project folder, but still leaves enough local
metadata for recovery, handoff, and user trust.

The tradeoff is a mandatory manifest and shim in project primary folders. That
is intentional: it gives Claw a stable identity anchor when paths change and
gives non-Claw tools a safe, minimal project contract.
