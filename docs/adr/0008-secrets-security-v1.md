# ADR 0008: Secrets Security V1

## Status

Accepted.

## Context

Secrets is the framework vault for credentials, tokens, private keys, recovery
material, and connector credentials. The decision thread
`019e26c5-ab74-7d02-80ce-c0d8d051c676` requires a V1 design closer to a
password-manager security model than a permissions-only store. Local processes,
plugins, connectors, public CLI commands, and agents are not trusted with
plaintext secrets by default.

## Decision

Secrets V1 uses a portable root based on master password plus generated Secret
Key. Setup creates an Emergency Kit containing the Secret Key and recovery
phrase. Normal unlock requires password plus Secret Key; recovery rotates the
password wrap, Secret Key, and recovery phrase so the previous Emergency Kit no
longer works.

The raw Secret Key is shown to the user and may be stored by the signed host in
a device-local Keychain item. Keychain must not store all vault secrets or
decrypted field values. Encrypted backups use a separate passphrase and must not
contain raw Secret Key material, platform wraps, Secure Enclave material, or
host-local Keychain material.

On macOS, Clawix is the signed host for Secrets. It stores only local bootstrap
material in Keychain with `ThisDeviceOnly`, provides native reauthentication
for sensitive reveal/copy/backup/recovery flows, and may offer biometric local
unlock through platform-local `platformKeyWrap`. If biometric/Secure
Enclave-backed local authentication is unavailable, unsupported, or fails, the
fallback is password plus Secret Key.

Sensitive Secrets operations require signed-host proof beyond loopback. The
Mac V1 boundary is Secrets-only: Clawix embeds a native XPC service for Secrets,
pins the allowed caller to the Clawix bundle identifier, checks caller
TeamIdentifier against the signed service, and obtains per-request host
assertions from that XPC service. The ClawJS sidecar verifies the signed-host
token and the XPC-issued assertion over method, path, timestamp, and nonce.
Expired assertions and replayed assertions fail closed.

Agents, plugins, connector runtimes, and the public CLI never receive general
plaintext access. Human reveal is a signed-host UI operation with fresh
reauthentication for sensitive actions. Automation uses brokered execution:
the broker validates capability, host, placement, risk tier, approval/grant,
TTL/max uses, and compromise/lock/trash state, then injects only the required
field into the external call and returns redacted output.

Pre-v1 `resolvedFields` TypeScript declarations may remain as blocked
declarations, but production execution paths must not treat them as a safe
boundary. New integrations use broker handles and fail closed when context is
incomplete.

## Consequences

- V1 may break pre-public development vaults; no pre-v1 migration is required.
- iOS, remote hosts, and third-party physical validation are outside the Mac +
  ClawJS V1 closure, but must preserve the same E2E and no-plaintext-agent
  principles when implemented.
- Any future change that weakens Secret Key, Emergency Kit, XPC assertions,
  Keychain scope, backup scrubbing, broker context, or audit minimization must
  update this ADR and `docs/secrets-security.md` in the same change.
