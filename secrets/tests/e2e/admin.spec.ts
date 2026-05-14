import { expect, saveBrowserScreenshot, test } from "./helpers.js";

test("secrets admin console covers secret creation, policy assignment, principal issuance, lease revocation, and audit", async ({ page }) => {
  await page.request.post("/v1/secrets/setup", {
    headers: { "x-claw-signed-host-token": "secrets-test-signed-host" },
    data: { password: "secrets-e2e-password" },
  });
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", "/brand/favicon.ico");
  await expect(page.locator(".login-brand-mark img")).toHaveAttribute("src", "/brand/logo.png");

  await page.getByTestId("login-tenant").fill("clawix-local");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("secrets-console")).toBeVisible();
  await expect(page.locator(".brand-mark img")).toHaveAttribute("src", "/brand/logo.png");

  await page.getByTestId("secret-type-search").fill("RevenueCat");
  await page.getByTestId("secret-type-select").selectOption("revenuecat.api_key");
  await page.getByTestId("create-secret-submit").click();
  await expect(page.getByTestId("secret-card-telegram_support_bot_token")).toBeVisible();
  await expect(page.getByTestId("secret-card-telegram_support_bot_token")).toContainText("revenuecat.api_key");
  await page.getByTestId("secret-card-telegram_support_bot_token").click();
  await expect(page.getByTestId("capability-broker.http")).toContainText("allow");
  await expect(page.getByTestId("action-broker.http")).toContainText("broker.http");

  await page.getByTestId("nav-principals").click();
  await page.getByTestId("create-principal-submit").click();
  await expect(page.locator("#principal-token-output")).toContainText("sec_prn_");

  await page.getByTestId("nav-policies").click();
  await page.getByTestId("policy-capability").selectOption("lease.process");
  await page.getByTestId("create-policy-submit").click();
  await expect(page.locator("[data-testid^='policy-card-']")).toContainText("lease.process");

  await page.getByTestId("nav-leases").click();
  await page.getByTestId("create-lease-submit").click();
  const revokeButton = page.locator("[data-testid^='revoke-lease-']").first();
  await expect(revokeButton).toBeVisible();
  await revokeButton.click();
  await expect(page.locator("[data-testid^='lease-card-']").first()).toContainText("revoked");

  await page.getByTestId("nav-audit").click();
  await expect(page.locator("[data-testid^='audit-card-']").first()).toBeVisible();
  await expect(page.locator(".card-wide .list")).toContainText("adminCreate");
  await expect(page.locator(".card-wide .list")).toContainText("leaseRevoked");

  await saveBrowserScreenshot(page, "secrets-admin-console.png");
});
