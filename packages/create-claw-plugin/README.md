# create-claw-plugin

Bootstrap a distributed TypeScript plugin package for Claw.

This package is a direct generator entrypoint. The primary documented flow is `claw new plugin jira-integration`.

```bash
npx create-claw-plugin jira-integration
```

The generated package includes:

- a `plugin.json` manifest with runtime support metadata
- a config schema and validator
- hook handlers for lifecycle-style events
- one bundled skill to show plugin composition
- a local harness that validates config, hooks, and bundled capability output

After generation:

```bash
cd jira-integration
npm test
npm run plugin:check
```

Use this starter when one skill is too small and you need a shareable package that combines config, hooks, and packaged logic.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
