import { Buffer } from "node:buffer";

import { expect, saveBrowserScreenshot, test } from "./helpers";

test("drive console covers home, docs, sheets, slides, uploads, comments, and share links", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", "/brand/favicon.ico");
  await expect(page.locator(".brand-lockup img")).toHaveAttribute("src", "/brand/logo.png");

  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("drive-console")).toBeVisible();
  await saveBrowserScreenshot(page, "drive-home.png");

  await page.getByTestId("create-doc").click();
  await expect(page.getByTestId("doc-editor")).toBeVisible();
  await page.locator("[data-testid='doc-editor'] textarea").nth(0).fill("Drive doc body from Playwright");
  await page.getByTestId("add-comment").click();
  await page.getByPlaceholder("Add a comment").fill("Ship this draft");
  await page.getByTestId("add-comment").click();
  await page.getByTestId("create-share").click();
  await page.getByTestId("save-doc").click();
  await saveBrowserScreenshot(page, "drive-doc-editor.png");

  await page.getByTestId("create-sheet").click();
  await expect(page.getByTestId("sheet-editor")).toBeVisible();
  await page.getByTestId("sheet-cell-b2").fill("=1+2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sheet-cell-b2")).toHaveValue("3");

  await page.getByTestId("sheet-cell-a1").fill("1");
  await page.keyboard.press("Tab");
  await page.getByTestId("sheet-cell-b1").fill("2");
  await page.keyboard.press("Tab");
  await page.getByTestId("sheet-cell-c1").fill("3");
  await page.keyboard.press("Tab");
  await page.getByTestId("sheet-cell-d1").fill("=SUM(A1:C1)");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sheet-cell-d1")).toHaveValue("6");

  const importCsv = page.getByTestId("sheet-import-csv-input");
  await importCsv.setInputFiles({
    name: "data.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("10,20\n30,40\n", "utf8"),
  });
  await expect(page.getByTestId("sheet-cell-a1")).toHaveValue("10");
  await expect(page.getByTestId("sheet-cell-b2")).toHaveValue("40");

  await page.getByTestId("save-sheet").click();
  await saveBrowserScreenshot(page, "drive-sheet-editor.png");

  await page.getByTestId("create-slide").click();
  await expect(page.getByTestId("slide-editor")).toBeVisible();
  await page.locator(".slide-canvas input").fill("Launch review");
  await page.locator(".slide-canvas textarea").nth(0).fill("Main talking points for launch.");
  await page.getByTestId("save-slide").click();
  await saveBrowserScreenshot(page, "drive-slide-editor.png");

  await page.getByTestId("upload-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Uploaded note for preview", "utf8"),
  });
  await expect(page.getByTestId("upload-preview")).toBeVisible();
  await expect(page.getByTestId("upload-preview")).toContainText("Uploaded note for preview");
  await saveBrowserScreenshot(page, "drive-upload-preview.png");
});
