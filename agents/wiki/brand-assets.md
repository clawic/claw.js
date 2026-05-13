# Brand Assets

Use the repository root `assets/` directory as the single source of truth for shared brand images and shared UI fonts for internal dashboards and operational web apps.

Current shared assets:

- `assets/logo.png`
- `assets/favicon.ico`
- `assets/fonts/source-sans-3/*`
- `assets/fonts/ubuntu-mono/*`

Rules:

- Do not commit duplicate copies of these files under app-specific `assets/` folders.
- Internal dashboards and operational web UIs should serve shared brand assets and shared fonts from a dedicated runtime path such as `/brand/`.
- If an app needs its own static root for other assets, mount the shared brand directory separately instead of copying files into that app.
- When changing the shared logo, favicon, or shared fonts, update `assets/` once and keep E2E coverage on the consuming apps so broken mounts or references fail fast.

Exclusions:

- `website/` keeps its own marketing aesthetic and typography. Do not migrate it to the shared dashboard font stack.
- Chat clients and mobile-facing product clients keep their own client design system. Match the current iOS visual language instead of the internal dashboard styling.
- The shared font stack is for internal apps such as `relay`, `database`, `wiki`, `vault`, and similar future consoles or dashboards.

Current consumers:

- `database/`: serves repo-root brand assets at `/brand/*`.
- `relay/`: serves repo-root brand assets at `/brand/*` and proxies that path in Vite dev.
- `wiki/`: serves repo-root brand assets at `/brand/*` and proxies that path in Vite dev.
- `vault/`: serves repo-root brand assets at `/brand/*` and proxies that path in Vite dev.
