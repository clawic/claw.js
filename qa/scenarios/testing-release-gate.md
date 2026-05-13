# Testing Release Gate Scenario

Status: ACTIVE

Boundary: framework, CLI, browser E2E, privacy

## Purpose

Verify that a ClawJS release candidate has passed the required public testing
gate without live external effects.

## Steps

1. Run `npm run test:release`.
2. Confirm `npm run test:live` is not executed unless `CLAW_TEST_LIVE=1` is set.
3. Confirm generated artifacts are ignored or redacted.
4. Confirm any unavailable external validation is recorded as `EXTERNAL PENDING`
   and has a matching hermetic test.

## Expected Result

The release gate reports `PASS`, or reports actionable `FAIL` entries. Missing
physical/live integrations are tracked as `EXTERNAL PENDING`, not hidden as
passing tests.
