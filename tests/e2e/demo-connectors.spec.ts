import fs from "fs";
import path from "path";

import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

const connectorDir = path.join(process.cwd(), "demo", ".clawjs");
const catalogPath = path.join(connectorDir, "connector-catalog.json");
const subscriptionsPath = path.join(connectorDir, "connector-subscriptions.json");

const fixtureCatalog = {
  version: 1,
  generatedAt: "2026-05-12T18:00:00.000Z",
  sourceRevision: "e2e-fixture",
  apps: [
    {
      id: "fixture_connectors",
      name: "Fixture Connectors",
      authFieldNames: ["apiKey"],
      fields: [
        {
          name: "apiKey",
          type: "string",
          label: "API key",
          optional: false,
          secret: true,
        },
      ],
      operations: [
        {
          id: "fixture_connectors.source.invalid-field-source",
          appId: "fixture_connectors",
          kind: "source",
          name: "Invalid Field Source",
          fields: [
            {
              name: "channel",
              type: "string",
              label: "Channel",
              optional: false,
              options: [{ label: "Allowed", value: "allowed" }],
            },
          ],
          authFieldNames: ["apiKey"],
          runtime: {
            hasRun: true,
            hasHooks: true,
            hasAdditionalProps: false,
            hasMethods: false,
          },
          source: {
            delivery: "webhook",
            usesTimer: false,
            usesHttp: true,
            usesServiceDb: false,
          },
        },
      ],
    },
  ],
};

test.beforeEach(async ({ request }) => {
  fs.mkdirSync(connectorDir, { recursive: true });
  fs.writeFileSync(catalogPath, `${JSON.stringify(fixtureCatalog, null, 2)}\n`);
  fs.rmSync(subscriptionsPath, { force: true });
  await resetDemoState(request, "seeded");
});

test.afterAll(() => {
  fs.rmSync(catalogPath, { force: true });
  fs.rmSync(subscriptionsPath, { force: true });
});

test("connectors show invalid source subscription fields", async ({ page }) => {
  await page.goto("/connectors");
  await expect(page.getByTestId("connectors-page")).toBeVisible({ timeout: 20_000 });

  await expect(page.getByTestId("connector-operation").filter({ hasText: "Invalid Field Source" })).toHaveCount(1);
  await page.getByTestId("connector-values-json").fill(JSON.stringify({ channel: "blocked" }, null, 2));
  await page.getByTestId("connector-secret-refs-json").fill("{}");
  await page.getByTestId("connector-save-subscription").click();

  await expect(page.getByText("blocked · webhook")).toBeVisible();
  await expect(page.getByText("missing_secrets, invalid_fields")).toBeVisible();
  await expect(page.getByText("secrets: apiKey")).toBeVisible();
  await expect(page.getByText("invalid: channel")).toBeVisible();

  await saveArtifactScreenshot(page, "connectors-invalid-subscription.png");
});
