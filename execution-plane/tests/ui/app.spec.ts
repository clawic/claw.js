import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("execution plane UI supports login, project setup, run, and deployment", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  await page.getByTestId("create-project").click();
  await page.getByTestId("create-repository").click();
  await page.getByTestId("create-script-asset").click();

  await page.getByRole("link", { name: "Scripts" }).click();
  await page.getByTestId("save-script-revision").click();
  await page.getByTestId("run-latest-script").click();

  await page.getByRole("link", { name: "Runs" }).click();
  await expect(page.getByTestId("run-logs")).toContainText("ui build complete", { timeout: 20000 });

  await page.getByRole("link", { name: "Deployments" }).click();
  await page.getByTestId("create-deployment").click();
  await expect(page.getByText("Preview")).toBeVisible();

  const outputDir = path.join(process.cwd(), "artifacts", "ui");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "execution-plane-dashboard.png"),
    fullPage: true,
  });
});
