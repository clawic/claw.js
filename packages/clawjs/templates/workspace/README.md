# __APP_TITLE__

This workspace-first starter keeps the repository minimal while still wiring in the official ClawJS SDK and CLI.

## Scripts

- `npm run claw:init`
- `npm run claw:doctor`
- `npm run claw:info`

## Recommended flow

1. Install dependencies.
2. Run `npm run claw:init`.
3. Add skills, channels, providers, or plugins with `claw generate` and `claw add`.

If this project contains `claw.source.json`, it was generated in source mode.
Internal `@clawjs/*` packages resolve from that checkout, while npm still
installs third-party dependencies normally.

The starter uses the `demo` adapter by default so the workspace can be
initialized immediately. When switching to a real runtime, update both the
`package.json` scripts and `runtime.adapter` in `claw.project.json` before
running `npm run claw:init` again.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
