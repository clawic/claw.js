import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("monitor shell keeps the short product name", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Monitor");
  await expect(page.getByText("ClawJS", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All Monitors (1)", exact: true })).toBeVisible();

  const outputDir = path.join(process.cwd(), "output", "playwright");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "monitor-brand-e2e.png"),
    fullPage: true,
  });
});
