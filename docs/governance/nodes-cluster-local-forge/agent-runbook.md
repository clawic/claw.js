# Agent Runbook

## Operating Rules

- Start from `docs/governance/nodes-cluster-local-forge/index.md`.
- Work through the linked files in order.
- Mark checklist items only when the repository contains public-safe evidence.
- Treat durable node identity as a closure blocker: the implementation must
  separate stable `nodeId`/fingerprint trust from mutable locators before
  node/cluster work can close.
- Use `EXTERNAL PENDING` for physical devices, provider runs, signed-host
  proof, live credentials, real pushes, uploads, publishes, tags, or paid API
  calls unless explicit approval exists in the current thread.
- Do not add new governance cycles that do not reduce a concrete blocker.
- Do not mutate existing project folders, initialize Git, call real providers,
  reveal secrets, push, publish, upload, or tag without explicit approval.

## Prompt For Long-Running Agent

Trabaja desde `<repo-root>` y toma como archivo de entrada `docs/governance/nodes-cluster-local-forge/index.md`; sigue en orden todos los archivos de la carpeta `docs/governance/nodes-cluster-local-forge/`, marcando cada checklist solo cuando exista evidencia publica segura y ejecutando las validaciones indicadas despues de cada bloque. Tu objetivo es cerrar por completo las decisiones de node/cluster control plane, identidad criptografica durable de nodo, localizadores mutables y local forge/worktree review: promoverlas a ADRs reservados y aceptados, actualizar decision map, discoverability, operational coverage y governance index, implementar las superficies de framework que cada checklist exige, separar confianza por `nodeId`/fingerprint de reachability por IP/Tailscale/Relay/Iroh/LAN, y dejar cualquier dependencia fisica/provider/live como `EXTERNAL PENDING` con blocker, reentry condition y evidencia requerida. No cierres hasta que todos los checks esten completados o clasificados, no quede ninguna decision solo en notas de conversacion, pasen las validaciones de docs/privacy/discoverability/ADR/source-audit y los tests enfocados afectados, y el propio `testing-and-closure-checklist.md` diga que no queda nada por hacer salvo pendientes externos explicitos.
