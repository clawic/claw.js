# Official trust and compatibility

ClawJS is open source under MIT. You may use, fork, modify, redistribute, sell,
and build compatible software under the repository license. Official trust is a
separate claim: it tells users which artifacts and channels are maintained by
upstream.

## Labels

- `official`: produced or distributed by upstream.
- `source`: built directly from source by a user or organization.
- `community`: distributed by a third party.
- `compatible`: implements a stated ClawJS/Claw contract without being
  upstream.

Do not use `official` for a fork, modified build, package, registry entry,
service, website, or support channel unless upstream maintains or explicitly
authorizes that channel.

## Compatibility levels

Compatibility can be partial and still useful when it is named clearly:

- `Core-compatible`: CLI, schemas, storage basics, and core contracts.
- `Host-compatible`: host registry, permissions, approvals, and host behavior.
- `Remote-compatible`: Relay, sync, remote-safe routes, and remote policy.
- `Plugin-compatible`: plugin manifest, package, lifecycle, and safety rules.

Truthful compatibility claims are welcome. Compatibility does not imply
endorsement, sponsorship, or official status.

## Registry tiers

Future registries should use neutral tiers:

- `community`: submitted or maintained by a third party.
- `verified`: checked against the relevant public compatibility criteria.
- `official`: maintained by upstream.
- `deprecated` or `unsafe`: retained only when users need a safety or migration
  signal.

## Verification roadmap

The reserved future CLI surface is `claw verify`. It should make checksums,
signatures, provenance, host/build identity, and compatibility metadata
scriptable when implemented. Until that surface exists, release notes,
checksums, package metadata, and official docs are the public trust contract.

## Boundaries

This policy does not add restrictions to the MIT license. It does reserve
official identity, marks, and channels so users can distinguish upstream from
source builds, community builds, and compatible third-party work.
