import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("notify hub exposes inbox, preferences, apps, and operations from the live notify backend", async ({ page }) => {
  const appErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") appErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    appErrors.push(error.message);
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/Notify Hub/);
  await expect(page.getByRole("heading", { name: /full notification operations/i })).toBeVisible();
  await expect(page.getByTestId("notify-inbox-list")).toContainText("Alpha deployment failed");

  await page.getByRole("tab", { name: "Preferences" }).click();
  await expect(page.getByTestId("notify-preferences-card")).toBeVisible();
  await page.getByRole("button", { name: /save delivery policy/i }).click();
  await expect(page.getByTestId("notify-preferences-card")).toContainText("Enable quiet hours");

  await page.getByRole("tab", { name: "Apps" }).click();
  await expect(page.getByTestId("notify-source-apps")).toContainText("Ops Center");

  await page.getByRole("tab", { name: "Operations" }).click();
  await expect(page.getByTestId("notify-operations-panel")).toContainText("Recent notifications");
  await page.getByRole("button", { name: /send notification/i }).click();

  await page.getByRole("tab", { name: "Inbox" }).click();
  await expect(page.getByTestId("notify-inbox-list")).toContainText("Manual notification");

  const outputDir = path.join(process.cwd(), "output", "playwright");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "notify-hub-e2e.png"),
    fullPage: true,
  });

  expect(appErrors).toEqual([]);
});
