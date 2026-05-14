## Summary

## Checklist

- [ ] The branch name is scoped and short (`feat/*`, `fix/*`, `docs/*`, `chore/*`, `release/*`).
- [ ] I ran the relevant local gate (`npm run ci`, targeted checks, or the blocking E2E suite when behavior changed) and checked the Release Gate when this targets a release branch.
- [ ] I updated docs/examples/changelog if the public surface changed.
- [ ] I added a `.changeset/*.md` entry for published package changes, or this PR is docs-only, test-only, or internal-only.
- [ ] I confirmed the change is ready to merge into `main`, `next`, or an active `release/*` branch.

## Release Notes

- Does this need a changelog entry? If yes, include the user-facing note here.
