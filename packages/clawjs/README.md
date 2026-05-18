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

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
