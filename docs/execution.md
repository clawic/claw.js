---
title: Execution
description: Overview of the standalone execution service for agent-authored code, runs, notebooks, workers, and deployments.
---

# Execution

`execution/` is a standalone top-level service for running, reviewing, and deploying agent-authored code without coupling that state to the core SDK, `relay`, or `secrets`.

The current implementation includes:

- a multitenant Fastify control plane with SQLite persistence
- reverse-connected workers over WebSocket
- Git-native repositories, revisions, and change requests
- scripts and notebooks backed by one shared run model
- artifacts, workflows, and deployment promotion for `static` and `node-web`
- a bundled React UI for operators

Source of truth for the product scope and internal contracts lives under [`execution/`](https://github.com/clawic/clawjs/blob/main/execution/README.md).
