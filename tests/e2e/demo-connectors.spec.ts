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
    {
      id: "telegram_bot_api",
      name: "Telegram Bot",
      authFieldNames: ["telegramBotApi"],
      fields: [
        {
          name: "telegramBotApi",
          type: "app",
          label: "Bot token",
          optional: false,
          secret: true,
        },
      ],
      operations: [
        {
          id: "telegram_bot_api.action.send-text-message-or-reply-send-text-message-or-reply",
          appId: "telegram_bot_api",
          kind: "action",
          name: "Send Text Message",
          fields: [
            {
              name: "chatId",
              type: "string",
              label: "Chat ID",
              optional: false,
            },
            {
              name: "text",
              type: "string",
              label: "Text",
              optional: false,
            },
          ],
          authFieldNames: ["telegramBotApi"],
          runtime: {
            hasRun: true,
            hasHooks: false,
            hasAdditionalProps: false,
            hasMethods: true,
            methodNames: ["request"],
          },
        },
        {
          id: "telegram_bot_api.source.new-bot-command-received-new-bot-command-received",
          appId: "telegram_bot_api",
          kind: "source",
          name: "New Bot Command",
          fields: [
            {
              name: "commands",
              type: "string",
              label: "Commands",
              optional: true,
            },
            {
              name: "timer",
              type: "$.interface.timer",
              label: "Timer",
              optional: false,
              managed: true,
            },
          ],
          authFieldNames: ["telegramBotApi"],
          runtime: {
            hasRun: false,
            hasHooks: true,
            hookNames: ["deploy"],
            hasAdditionalProps: false,
            hasMethods: false,
            methodNames: [],
            dedupe: "unique",
          },
          source: {
            delivery: "polling",
            usesTimer: true,
            usesHttp: false,
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

test("connectors show offline execution plans for supported actions", async ({ page }) => {
  await page.goto("/connectors");
  await expect(page.getByTestId("connectors-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("connector-operation").filter({ hasText: "Send Text Message" }).click();
  await page.getByTestId("connector-values-json").fill(JSON.stringify({ chatId: "123", text: "hello" }, null, 2));
  await page.getByTestId("connector-secret-refs-json").fill(JSON.stringify({ telegramBotApi: "vault://connections/test/bot" }, null, 2));
  await page.getByTestId("connector-dry-run").click();

  await expect(page.getByText('"runtimePlan"')).toBeVisible();
  await expect(page.getByText('"executorId": "telegram-bot-api.action.http"')).toBeVisible();
  await expect(page.getByText('"endpoint": "sendMessage"')).toBeVisible();
  await expect(page.getByText('"chat_id": "123"')).toBeVisible();
  await expect(page.getByText('"field": "telegramBotApi"')).toBeVisible();
});

test("connectors show offline execution plans for supported sources", async ({ page }) => {
  await page.goto("/connectors");
  await expect(page.getByTestId("connectors-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("connector-operation").filter({ hasText: "New Bot Command" }).click();
  await page.getByTestId("connector-values-json").fill(JSON.stringify({ commands: "[\"/start\"]" }, null, 2));
  await page.getByTestId("connector-secret-refs-json").fill(JSON.stringify({ telegramBotApi: "vault://connections/test/bot" }, null, 2));
  await page.getByTestId("connector-dry-run").click();

  await expect(page.getByText('"runtimePlan"')).toBeVisible();
  await expect(page.getByText('"executorId": "telegram-bot-api.source.polling"')).toBeVisible();
  await expect(page.getByText('"sourcePlan"')).toBeVisible();
  await expect(page.getByText('"delivery": "polling"')).toBeVisible();
  await expect(page.getByText('"dedupe": "unique"')).toBeVisible();
  await expect(page.getByText('"deploy"')).toBeVisible();
});
