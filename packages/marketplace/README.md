# @clawjs/marketplace

Reference implementation of the `marketplace/1.0.0` peer-to-peer marketplace protocol.

Wire format, identity model and discovery rules are specified in the public
[`marketplace-protocol`](../../../marketplace-protocol/SPEC.md) repository. This package is the
TypeScript reference implementation: it produces and verifies the same bytes
the spec defines.

## Modules

- `identity` — RootKey / DeviceKey / RoleKey / OneShotKey, certificates,
  compound signatures, sealed-box derivation, mnemonic recovery (synthetic in
  Phase 1, BIP-39 from Phase 2 onward).
- `wire` — canonical CBOR encoding, Intent envelope, envelope kinds.
- `mailbox` — sealed-box encrypted, compound-signed messages.
- `match` — `MatchReceipt` creation, signing and verification.
- `discovery` — in-process broker (Phase 1), in-memory DHT and gossip stubs
  (Phase 4 wires up Iroh/Kademlia/mDNS).
- `stream` — invite/accept envelopes for the optional real-time stream
  upgrade.
- `verticals` — typed profiles. Phase 1 ships `test-vertical` and
  `real-estate`.

## Scope per phase

- Phase 1 (this version): identity, wire, mailbox, match, in-process broker,
  test-vertical, real-estate. Verified by the two-node E2E test in `tests/`.
- Phase 2: macOS UI for real-estate, BIP-39 mnemonic, recovery announcements.
- Phase 3: more verticals (dating, freelance, vehicles, services, products).
- Phase 4: Iroh DHT, mDNS gossip, real broker federation.
- Phase 5: iOS/Android/Web clients.
