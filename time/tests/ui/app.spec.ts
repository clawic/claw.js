import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("time ui supports event, automation, follow-up, and runs flows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("time-page")).toBeVisible();

  await page.getByTestId("create-event-button").click();
  await expect(page.getByTestId("item-card").filter({ hasText: "Release sync" })).toHaveCount(1);

  await page.getByTestId("create-routine-button").click();
  await expect(page.getByTestId("item-card").filter({ hasText: "Deployment health" })).toHaveCount(1);

  await page.getByTestId("create-followup-button").click();
  const followUpCard = page.getByTestId("item-card").filter({ hasText: "Waiting on reply" });
  await expect(followUpCard).toHaveCount(1);

  await page.getByTestId("simulate-reply-button").click();
  await expect(followUpCard).toContainText("cancelled");

  await page.getByTestId("run-routine-button").click();
  await page.getByTestId("tab-runs").click();
  await expect(page.getByTestId("execution-row").first()).toBeVisible();

  const outputDir = path.join(process.cwd(), "artifacts", "ui");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "time-dashboard.png"),
    fullPage: true,
  });
});
