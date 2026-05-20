# Network Control Plane

The Network Control Plane is the Claw-owned policy layer for network activity,
route decisions, adapter readiness, review, and local network history.

## Ownership

ClawJS owns the portable contracts and CLI:

- subjects: app/process, Claw agent, provider, connector, Gateway, route, and
  automation
- endpoints: domain, host, IP/CIDR, local network, DNS server, Gateway route,
  and provider endpoint
- rules: allow, deny, ask, notify, hide, route via, and require VPN
- events: observed activity, matched rules, decision, byte counts, adapter, and
  redaction state
- manifests: expected network access and purpose for agents, providers,
  connectors, gateways, and routes
- adapters: Claw runtime, Gateway, macOS content filter, DNS proxy, Endpoint
  Security, VPN, and blocklists

Clawix owns the signed-host projection: native status, review UI, permission
state, and host-operational adapter state. Native macOS enforcement remains
`external_pending` until the required entitlements and validation evidence exist.

## CLI

`claw network` is the canonical portal:

```bash
claw network status --json
claw network events --json
claw network events record --route-id remote.chatGateway --json
claw network rules list --json
claw network rules upsert network.rule.example --action deny --subject-kind gateway --endpoint-kind gateway_route --endpoint remote.searchGateway --json
claw network explain remote.chatGateway --json
claw network routes --route-id remote.chatGateway --json
claw network adapters --json
claw network manifests --json
claw network suggestions --json
claw network doctor --json
```

Related roots remain discoverable: `claw wifi`, `claw vpn`, `claw proxy`,
`claw firewall`, `claw gateway`, and `claw system`.

## Storage

Network events and rollups are written to Monitor (`monitor.sqlite`) using
network-specific tables. Rules and local control-plane preferences are framework
state under the workspace `.claw/` data path.

## Privacy And Authority

The default redaction level is aggregate. Process and domain detail requires
`--detail-opt-in true` or the equivalent UI setting. Agents can generate
suggestions, but suggestions are disabled by default and must be applied by a
human or by an explicit grant.

Packet payload inspection and TLS decryption are out of scope.
