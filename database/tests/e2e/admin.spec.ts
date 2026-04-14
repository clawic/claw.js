import path from "node:path";

import { expect, saveBrowserScreenshot, test } from "./helpers";

test("admin console covers namespace, collection, records, tokens, files, and realtime", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Database");
  await expect(page.locator(".login-brand")).toHaveText("Database");
  await expect(page.locator(".login-logo img")).toHaveAttribute("src", "/brand/logo.png");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", "/brand/favicon.ico");

  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-console")).toBeVisible();

  // Create namespace via the database switcher dropdown.
  await page.locator("#db-switcher").click();
  await page.locator("#namespace-id").fill("sales");
  await page.locator("#namespace-display-name").fill("Sales");
  await page.getByTestId("namespace-form").getByRole("button", { name: "Create database" }).click();
  await expect(page.getByTestId("namespace-sales")).toBeVisible();
  await page.getByTestId("namespace-sales").click();
  await expect(page.locator("#active-namespace-name")).toHaveText("Sales");
  await expect(page.getByTestId("collection-people")).toBeVisible();
  await expect(page.getByTestId("collection-tasks")).toBeVisible();

  // Create a new collection through the schema drawer (same panel as PB).
  await page.locator("#new-collection-btn").click();
  await page.locator("#schema-coll-name").fill("leads");
  // Set fields via the hidden JSON editor (inside collapsed <details>)
  const fieldsJson = JSON.stringify([
    { name: "name", type: "text", required: true },
    { name: "status", type: "select", options: ["draft", "active"] },
    { name: "website", type: "url" },
  ], null, 2);
  await page.evaluate((json) => { document.getElementById("schema-editor").value = json; }, fieldsJson);
  await page.locator("#schema-save").click();
  await expect(page.getByTestId("collection-leads")).toBeVisible();
  await page.locator("#schema-drawer-close").click();
  await page.getByTestId("collection-leads").click();
  await expect(page.locator("#schema-title")).toHaveText("Leads");

  // Create a record through the right-side drawer.
  await page.locator("#new-record-btn").click();
  await page.locator("#record-data").fill(JSON.stringify({
    name: "Acme Corp",
    status: "draft",
    website: "https://acme.test",
  }, null, 2));
  await page.getByTestId("record-form").getByRole("button", { name: "Save record" }).click();
  await expect(page.getByTestId("records-table")).toContainText("Acme Corp");

  // Logs view surfaces realtime events.
  await page.getByTestId("nav-logs").click();
  await expect(page.getByTestId("activity-card")).toContainText("record.created");

  // Tokens view: issue a scoped token.
  await page.getByTestId("nav-tokens").click();
  await page.locator("#token-label").fill("sales-bot");
  await page.locator("#token-collection").fill("leads");
  await page.getByTestId("token-form").getByRole("button", { name: "Issue token" }).click();
  await expect(page.locator("#token-output")).toContainText("\"token\"");
  await expect(page.getByTestId("token-card")).toContainText("sales-bot");

  // Files view: upload an asset.
  await page.getByTestId("nav-files").click();
  await page.locator("#file-input").setInputFiles(path.join(process.cwd(), "tests", "e2e", "fixtures-upload.txt"));
  await page.getByTestId("file-form").getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByTestId("file-card")).toContainText("fixtures-upload.txt");

  await page.getByTestId("nav-settings").click();
  await expect(page.locator("#settings-name")).toHaveValue("Database");

  // Create a second record and verify it shows up in the log feed.
  await page.getByTestId("nav-collections").click();
  await page.locator("#new-record-btn").click();
  await page.locator("#record-data").fill(JSON.stringify({
    name: "Beta Ltd",
    status: "active",
    website: "https://beta.test",
  }, null, 2));
  await page.getByTestId("record-form").getByRole("button", { name: "Save record" }).click();
  await page.getByTestId("nav-logs").click();
  await expect(page.getByTestId("activity-card")).toContainText("Beta Ltd");

  await saveBrowserScreenshot(page, "database-admin-console.png");
});
