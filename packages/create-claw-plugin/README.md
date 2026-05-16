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
