# Brand Assets

Use the repository root `public/` directory as the single source of truth for shared brand images and shared UI fonts.

Current shared assets:

- `public/logo.png`
- `public/favicon.ico`
- `public/fonts/source-sans-3/*`
- `public/fonts/ubuntu-mono/*`

Rules:

- Do not commit duplicate copies of these files under app-specific `public/` folders.
- App UIs should serve shared brand assets and shared fonts from a dedicated runtime path such as `/brand/`.
- If an app needs its own static root for other assets, mount the shared brand directory separately instead of copying files into that app.
- When changing the shared logo, favicon, or shared fonts, update `public/` once and keep E2E coverage on the consuming apps so broken mounts or references fail fast.

Current consumers:

- `database/`: serves repo-root brand assets at `/brand/*`.
- `relay/`: serves repo-root brand assets at `/brand/*` and proxies that path in Vite dev.
