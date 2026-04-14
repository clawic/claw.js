import { expect, saveBrowserScreenshot, test } from "./helpers";

test("iot console covers scenes, approvals, and timeline", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("IoT");
  await expect(page.getByTestId("iot-console")).toBeVisible();
  await expect(page.locator(".hero-brand img")).toHaveAttribute("src", "/brand/logo.png");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", "/brand/favicon.ico");

  await page.evaluate(async () => {
    await fetch("/v1/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ family: "lock", selector: "front door", action: "unlock" }),
    });
  });
  await page.reload();

  const approvalCard = page.locator("[data-testid^='iot-approval-']").first();
  await expect(approvalCard).toContainText("pending");
  await approvalCard.getByRole("button", { name: "Approve" }).click();
  await expect(approvalCard).toContainText("executed");

  await page.getByTestId("iot-scene-scene_good_night").click();
  await expect(page.getByTestId("iot-events-panel")).toContainText("iot.scene.activated");

  await saveBrowserScreenshot(page, "iot-console.png");
});
