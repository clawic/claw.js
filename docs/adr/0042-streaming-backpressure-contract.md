# ADR 0042: Streaming backpressure contract

Status: Accepted

Date: 2026-05-21

## Context

Streaming is a core ClawJS and Clawix product path. Agent chat, session events,
Relay monitor streams, WebSocket connector routes, IPC bridges, stdout event
streams, and UI transcript rendering all carry partial model or runtime output.
Before this decision, those paths had useful local protections, but no single
contract made slow consumers, large payloads, cancellation, overflow, and
incremental persistence mandatory across transports.

The source decision is P0: streaming must be real deltas, not accumulated text
replayed as fake streaming, and no streaming route may require a giant
transcript buffer to make progress.

## Decision

ClawJS owns the canonical streaming and backpressure contract. Clawix mirrors
it for signed-host bridge, IPC, WebSocket, and UI behavior.

Every streaming, IPC, SSE, WebSocket, stdout-event, session-event, Relay, and
UI-delta route must declare a streaming policy. The default policy is
`claw.streaming.default.v1` with:

- max frame size: 65,536 bytes;
- max queued frames: 256;
- max queued bytes: 16,777,216;
- buffer policy: bounded queue, close or abort slow consumers on overflow;
- coalescing policy: same message/session key or UI animation frame;
- slow-consumer behavior: apply transport backpressure first, then close or
  abort only the slow consumer;
- cancellation: propagate `AbortSignal` or native cancellation to provider,
  process, stream reader, bridge task, and UI subscription;
- overflow metrics: `streamOverflowCount`, `streamDroppedFrames`,
  `streamDroppedBytes`, and `streamClosedSlowConsumers`;
- persistence: append incremental deltas/events, never keep a full transcript
  in memory merely to simulate streaming.

CLI fallback paths may emit a single real final chunk only when the upstream
transport cannot provide live deltas, but those chunks still obey max-frame
splitting and must not be labeled as live provider streaming.

## Threat Model Impact

This decision touches Relay, connectors, host bridge IPC, external runtime
outputs, and prompt/tool boundaries. A hostile local process, network peer, or
malformed provider stream could try to exhaust memory, force UI stalls, hide
overflow, or keep a cancelled operation alive.

Controls are bounded frames, bounded queues, per-consumer overflow closure,
observable metrics, cancellation propagation, and fixture tests for large
payloads and slow consumers. The existing global threat model coverage for
Relay, connectors, host bridge, prompt/tool boundaries, and hostile local
processes covers the affected surfaces; this ADR adds resource-exhaustion
specific validation.

## Performance Impact

Streaming affects CPU, RAM, UI render cost, network/IPC throughput, disk
growth, battery, and thermals. This contract makes those costs bounded:
frames and queues have explicit limits, coalescing reduces render churn,
slow consumers are isolated, and persistence is incremental.

The implementation adds static contract metadata, a docs guardrail, and focused
fixture tests. It does not add background telemetry or real-provider calls.

## Decision Tensions

- **Prioritized axes**: performance and nonblocking behavior; reliability;
  observable failure; user data ownership; agent and UI experience.
- **Constrained axes**: transport-specific tuning remains minimal until
  measurements justify separate policies.
- **Tradeoffs accepted**: some slow clients are closed earlier, but the
  alternative is unbounded memory growth or global UI stalls.
- **Debt or pending evidence**: physical-device and live-provider validation
  remain external-pending unless explicitly approved.

## Adoption And Canonicity

This ADR does not claim broad public adoption or V1 canonicity promotion. It
defines an internal accepted P0 contract for current ClawJS/Clawix streaming
surfaces.

## Source Decision Audit

Source audit row `SBC-001` records the 2026-05-21 user decision to make
streaming/backpressure a P0 contract.

## Surface Parity

- **Human surface**: this ADR, `docs/decision-map.md`, Clawix mirror ADR, and
  UI streaming behavior in Clawix/Relay monitor surfaces.
- **Programmatic surface**: `packages/clawjs-core/src/streaming-backpressure.ts`,
  surface registry `streamingPolicyId`, session stream APIs, sessions SSE
  metrics, and `scripts/streaming-backpressure-contract-check.mjs`.
- **Persistence**: this ADR, discoverability registry, operational coverage,
  surface registry, and incremental session/event stores carry the contract.
- **Gaps**: live provider/device evidence is `EXTERNAL PENDING`; fixture tests
  are the required local validation.
- **Validation**: core policy tests, session streaming tests, sessions SSE
  slow-consumer/large-payload tests, Clawix chat publication tests, and the
  streaming contract guard.

## Discovery Route

- **Canonical name**: `adr:streaming-backpressure-contract`.
- **AGENTS/CLAUDE**: `AGENTS.md` routes durable runtime, bridge, IPC, Relay,
  and performance work through `docs/decision-map.md`, which routes here.
- **Skill**: `adr-to-guardrail` for ADR implementation; performance
  investigation for measured regressions.
- **Docs router**: `docs/decision-map.md` and `docs/discoverability.md`.
- **CLI**: `claw search "streaming backpressure" --json` and
  `claw inspect route chat.localDesktop --json`.
- **Registry**: `docs/discoverability.registry.json` records this ADR and the
  guardrail script.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`
  records the guardrail, surfaces, persistence, and inspect route.

## Consequences

New streaming routes must be real incremental streams, frame-bounded,
queue-bounded, cancellable, observable on overflow, and incremental in
persistence. Existing routes keep their transport-specific behavior but must
conform to the shared policy or document an explicit exception.
