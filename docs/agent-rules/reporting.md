# Agent Reporting Rules

Use `claw report` whenever an agent wants to help a user send feedback to
GitHub.

## Required Flow

1. Draft the report locally with `claw report bug`, `feature`, `translation`,
   `security`, or `draft`.
2. Run `claw report check <id>` when the draft is incomplete or edited.
3. Run `claw report dedupe <id>` before recommending publication.
4. Show `claw report preview <id>` to the user.
5. Publish only after explicit user confirmation through the Claw GitHub
   connector. Use `--dry-run` first when validating. Use `--execute` only with
   a signed-host approval id and a brokered GitHub token; local fake endpoints
   are allowed for tests, while real publication without an approved connector
   path is `EXTERNAL PENDING`.
6. Use `claw report triage` for automation queues and recommendations. Treat
   its output as advisory until a human approves the external action.

## Hard Rules

- Do not publish raw logs, secrets, local usernames, full local paths, host
  names, private URLs, auth headers, tokens, or production data.
- Do not include attachments unless the user opted in to each attachment.
- Do not publish security findings publicly. Route them privately.
- Do not create automatic pull requests. Only propose a PR path when the user
  explicitly asks.
- Do not close, lock, or suppress reports automatically. Automation may label,
  dedupe, recommend, and comment on the canonical item.
- If the report lacks enough actionable information, block publication with
  `NOT_ENOUGH_INFO` and ask for the missing fields.
- If validation needs a real external service, paid API, production data, or a
  physical integration that is not available, record `EXTERNAL PENDING`.
- Publication must use the user's GitHub identity through the Claw connector
  and secret broker. Do not shell out to `gh` by default.

## Routing

- Concrete bugs, crashes, regressions, documentation issues, performance
  defects, and specific translation fixes route to GitHub Issues.
- Broad ideas route to the GitHub Discussions category `Ideas`.
- Broad UX/product feedback routes to the GitHub Discussions category
  `Feedback`.
- Security findings route to private security advisory handling.
- Duplicate reports should comment on the canonical item instead of creating
  a new issue.
- Automation may recommend labels, comments, duplicate routing, and evidence
  tasks. It must not close, lock, delete, or publish.
