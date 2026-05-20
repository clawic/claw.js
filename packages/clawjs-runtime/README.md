# @clawjs/runtime

Out-of-band runtime loop services for ClawJS: skill distillation, periodic nudges, cross-session user model refresh.

## Jobs API

The runtime service exposes local authenticated job controls for the built-in
runtime job kinds:

- `GET /v1/runtime/jobs` lists recent jobs.
- `GET /v1/runtime/jobs/:id` reads one job.
- `GET /v1/runtime/jobs/events` and `GET /v1/runtime/jobs/:id/events` return
  ordered job event snapshots for stream consumers.
- `POST /v1/runtime/jobs/start` starts an approved runtime job kind through the
  existing runtime runners.
- `POST /v1/runtime/jobs/:id/cancel` records cancellation for a non-terminal
  runtime job.

These routes are local runtime API contracts. Custom-app execution through
Clawix `window.clawix.jobs.stream/start/cancel` still requires host bridge
policy, audit, and adapter wiring before it is exposed.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
