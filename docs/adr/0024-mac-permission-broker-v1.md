# ADR 0024: Mac Permission Broker V1

## Status

Accepted.

## Context

macOS permissions are currently scattered across feature code such as voice,
screen capture, app/window access, and host services. That makes it difficult
to know which permissions a host has, why a prompt appears, which actor caused
it, or whether revocation broke a workflow.

## Decision

Create a central Mac Permission Broker:

- `claw permissions` is the public root for OS permission and framework grant
  state.
- Permission ids are atomic, for example `mac.permission.microphone`.
- User-facing packs are intent-based: Windows, Voice, Network, Automation,
  Files, Screen, Privacy, Notifications, and related packs.
- Permission requests are just-in-time and plan-first.
- Prompt copy, Info.plist usage descriptions, and entitlements are registry
  owned and verified.
- Permission state is tracked per host identity, bundle id, signing identity,
  app variant, and version because macOS TCC is bound to signed apps.
- Lifecycle audit records first use, request, result, last check, revocation,
  actor, capability, and host.

## Consequences

- Feature code must not request macOS permissions directly.
- Services such as dictation or screen tools consume the central broker rather
  than owning permission logic.
- Agents cannot self-escalate. They create approval requests with reason,
  capability, OS permission, risk, duration, and preview.
- The most restrictive policy wins.
