import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("wiki login and shell keep the short product name", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Wiki");
  await expect(page.locator(".wiki-login-brand")).toHaveText("Wiki");

  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("**/main");
  await expect(page.locator("aside").getByText("Wiki", { exact: true })).toBeVisible();

  const outputDir = path.join(process.cwd(), "output", "playwright");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "wiki-brand-e2e.png"),
    fullPage: true,
  });
});
