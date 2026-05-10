# @clawjs/ssh-client

Audited SSH client for hosts registered in the Claw mesh.

This package provides:

- SSH session pooling for mesh hosts with SSH endpoints.
- Password, private-key, and SSH agent authentication.
- Trust-on-first-use known-host fingerprint storage.
- Exec helpers with stdout and stderr capture, streaming callbacks, and timeouts.
- SFTP helpers used to install the Claw bridge binary on Linux hosts.

```ts
import { SshClient, InMemoryKnownHostsStore } from "@clawjs/ssh-client";

const client = new SshClient({
  hostResolver,
  secretResolver,
  knownHostsStore: new InMemoryKnownHostsStore(),
});

const session = await client.open("host-1");
const result = await session.exec({ command: "uname -a" });
```

The package expects host records from `@clawjs/mesh` and an application-owned
secret resolver. Do not pass plaintext secrets through logs or persisted host
metadata.
