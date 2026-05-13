# @clawjs/cli

Official CLI for Claw.

Install the CLI globally:

```bash
npm install -g @clawjs/cli
claw --help
```

The package exposes `claw` as the public command. It does not expose a
public `clawjs` binary.

Official project flow:

```bash
claw new app my-app
cd my-app
npm run claw:init
claw generate skill support-triage
claw add telegram
```

The `create-claw-app`, `create-claw-agent`, `create-claw-server`, and
`create-claw-plugin` bins remain available for package-manager create flows,
but `claw new` is the primary documented entrypoint.
