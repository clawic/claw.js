# @clawjs/mesh

Registry, persistence and bridge protocol for hosts in the Claw mesh.

Provides the canonical models (`Host`, `HostEndpoint`, `HostSSHConfig`,
`HostMetadata`), the SQLite-backed stores (`HostStore`, `IdentityStore`,
`WorkspaceStore`, `AuditStore`, `SshSecretStore`), the signed/encrypted
envelope crypto, the pairing flow, the Bonjour announcement, the WebSocket
bridge server, and the Fastify mesh HTTP plugin.

## HTTP API

All routes are mounted under `/mesh/*` via `meshServerPlugin`. Three of them
are public (bearer-token guarded), the rest are loopback-only. Audit events
are emitted for every state-changing call.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/mesh/identity` | `Bearer` | Node identity + endpoints + capabilities. |
| GET | `/mesh/peers` | loopback | All known peers including revoked. |
| GET | `/mesh/workspaces` | loopback | Local workspaces published by this node. |
| POST | `/mesh/link` | loopback | Initiate pairing against a remote peer via `MeshLinkClient`. |
| POST | `/mesh/pair` | `token` body | Accept a pairing request from a remote peer. |
| POST | `/mesh/jobs` | encrypted envelope | Receive a job from a known peer. Body is a `SignedEnvelope` (encrypted variant). |
| POST | `/mesh/remote-jobs` | loopback | Send a job to a peer (stub; concrete dispatch lives in the daemon). |
| POST | `/mesh/hosts` | loopback | Upsert a host record. Optional `sshSecret` is persisted in `SshSecretStore`. |
| DELETE | `/mesh/hosts/:id` | loopback | Hard-delete a host (and its endpoints via cascade). |
| POST | `/mesh/hosts/:id/revoke` | loopback | Mark host as revoked (soft-delete). |
| POST | `/mesh/hosts/:id/unrevoke` | loopback | Clear revoked flag. |
| GET | `/mesh/ssh/secrets` | loopback | List secret metadata (no payloads). |
| DELETE | `/mesh/ssh/secrets/:id` | loopback | Remove a stored SSH secret. |

### `POST /mesh/hosts`

Adds or updates a host registration. The request runs on loopback only
(`127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `localhost`) so it cannot be reached
from the LAN, Tailscale, or remote peers.

Body shape:

```jsonc
{
  "host": {
    "id": "vps-hetzner-1",                  // optional, generated if omitted
    "kind": "linuxServer",
    "displayName": "Hetzner VPS",
    "endpoints": [
      { "kind": "ssh", "host": "1.2.3.4", "port": 22, "protocol": "ssh" }
    ],
    "permissionProfile": "scoped",
    "capabilities": ["shell", "docker"],
    "ssh": {
      "user": "ubuntu",
      "authMethod": "password",
      "passwordSecretId": "vps-hetzner-1-pw"
    },
    "metadata": { "tags": ["vps", "prod"], "provider": "hetzner" }
  },
  "sshSecret": {                            // optional; required if authMethod uses a secret
    "id": "vps-hetzner-1-pw",
    "secret": { "kind": "password", "password": "..." }
  }
}
```

Response (`200 OK`):

```json
{
  "host": { /* full Host record persisted by HostStore */ },
  "sshSecret": { "id": "vps-hetzner-1-pw", "kind": "password" }
}
```

The secret payload (password / private key / passphrase) is **never** echoed
back in the response. It lives only inside `SshSecretStore`'s SQLite table.

Audit: `meshLink` with `outcome=success` and `context={op:"host-upsert"}`.

### Adding a server from a Mac client

The Clawix Swift app should:

1. Collect the form input (kind, displayName, host, port, ssh user, auth
   method, secret value).
2. POST to `http://127.0.0.1:<httpPort>/mesh/hosts` with the body above.
3. On success, reuse the returned `host.id` in subsequent `ssh.*` bridge
   frames over the WebSocket (`ssh.exec`, `ssh.sftp.*`, `ssh.installBridge`).

Until the Swift daemon is replaced by the Node `clawjs-bridged` (see F8 of
the migration plan), this endpoint exists on the new daemon but is not yet
wired into the production Swift bridge. The contract above is the canonical
shape the Swift sheet should target once the cutover happens.

## Stores

`SshSecretStore` keeps private keys, passwords and passphrases in a
multitenant SQLite table. Secrets are never logged. Callers obtain them only
through explicit `get(id)` and pass them to `@clawjs/ssh-client` via the
`SecretResolver` interface.

## Capabilities advertised in `/mesh/identity`

Daemons assemble the list dynamically. Known values include `codex`,
`tcc.computer.screenshot`, `tcc.computer.input.keystroke`,
`tcc.computer.input.click`, `tcc.terminal.spawn`, `ssh.exec`, `ssh.sftp`,
`ssh.installBridge`. Clients should treat the list as additive and ignore
unknown entries.
