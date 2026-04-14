# Changesets

This repository versions all published npm packages in lockstep with one shared semver.

Use this flow for any PR that changes the public behavior, package surface, generated template output, or release notes of a published package:

```bash
npm run changeset
```

Choose the bump level:

- `patch`: bug fix or packaging-only change with no intended contract expansion
- `minor`: new backwards-compatible behavior or public capability
- `major`: intentional breaking change

Rules:

- Do not hand-edit published package versions outside the release workflow.
- Do not add a changeset for docs-only, test-only, or internal-only changes.
- Keep the summary user-facing. It becomes release metadata.
