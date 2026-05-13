# Domain Model

## Canonical Objects

### Project

The top-level product context.

Owns:

- repositories
- code assets
- workflows
- change requests
- workers assigned by policy
- deployments associated with the project

### Repository

A Git-backed source root connected to one project.

Required responsibilities:

- identify the remote origin and default branch
- map revisions to materializable workspaces
- remain the source of truth for shared code

### CodeAsset

A runnable or editable unit linked to a repository path and revision lineage.

Kinds:

- `script`
- `notebook`

Common properties:

- stable asset id
- project id
- repository id
- relative root path
- entrypoint or cell graph descriptor
- runtime requirements

### Revision

A versioned snapshot of a code asset.

Backed by:

- Git commit
- Git branch head
- or an unmerged patch set tracked by the execution plane

Every run points to exactly one revision.

### ChangeRequest

A reviewable proposal to merge one or more revisions into a target branch.

Tracks:

- author
- reviewers
- review status
- mergeability
- linked runs and artifacts

### Run

A concrete execution attempt for one revision on one worker.

Tracks:

- requested inputs
- worker assignment
- execution status
- log stream
- debug session availability
- produced artifacts

Every run is tied to one materialized local workspace on a worker.

### Artifact

A durable output produced by one run.

Examples:

- build bundle
- binary
- generated dataset
- report
- image
- deployment package

Every artifact comes from exactly one run.

### Workflow

A reusable orchestration over one or more code assets and runs.

Examples:

- scheduled job
- notebook promotion flow
- build and deploy pipeline
- review gate with required checks

### Worker

A local execution machine connected to the control plane.

Tracks:

- connectivity
- capabilities
- runtime availability
- queue state
- workspace root
- isolation features

### Deployment

A promoted artifact exposed through an environment, domain, or endpoint.

Tracks:

- artifact id
- environment
- promotion history
- active domain bindings
- certificate state
- rollback lineage

Every deployment points to exactly one artifact.

## Required Relationships

- every `Project` owns many `Repository`
- every `Repository` owns many `CodeAsset`
- every `CodeAsset` has many `Revision`
- every `Revision` may have many `Run`
- every `Run` belongs to one `Worker`
- every `Run` may emit many `Artifact`
- every `Deployment` points to one `Artifact`
- every `ChangeRequest` groups revisions or patches intended for merge

## Unifying Rules

- A script is a single-entrypoint code asset.
- A notebook is a multi-cell code asset.
- A workflow orchestrates runs over code assets.
- A deployment is a publish step over an artifact from a successful run.
- Interactive agent work and scheduled execution use the same worker substrate.
- Agent-authored changes are Git-native and augmented with product metadata, not stored as an alternate source-control system.
