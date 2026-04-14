import { expect, saveBrowserScreenshot, test } from "./helpers";

test("vault admin console covers secret creation, policy assignment, principal issuance, lease revocation, and audit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", "/brand/favicon.ico");
  await expect(page.locator(".login-brand-mark img")).toHaveAttribute("src", "/brand/logo.png");

  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("vault-console")).toBeVisible();
  await expect(page.locator(".brand-mark img")).toHaveAttribute("src", "/brand/logo.png");

  await page.getByTestId("secret-type-search").fill("RevenueCat");
  await page.getByTestId("secret-type-select").selectOption("revenuecat.api_key");
  await page.getByTestId("create-secret-submit").click();
  await expect(page.getByTestId("secret-card-telegram_support_bot_token")).toBeVisible();
  await expect(page.getByTestId("secret-card-telegram_support_bot_token")).toContainText("revenuecat.api_key");
  await page.getByTestId("secret-card-telegram_support_bot_token").click();
  await expect(page.getByTestId("capability-broker.http")).toContainText("deny");
  await expect(page.getByTestId("action-revenuecat.projects.list")).toContainText("revenuecat.projects.list");
  await page.getByTestId("rotate-secret-submit").click();
  await expect(page.getByTestId("secret-card-telegram_support_bot_token")).toContainText("v2");

  await page.getByTestId("nav-principals").click();
  await page.getByTestId("create-principal-submit").click();
  await expect(page.locator("#principal-token-output")).toContainText("vlt_prn_");

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
  await expect(page.locator(".card-wide .list")).toContainText("secret.upsert");
  await expect(page.locator(".card-wide .list")).toContainText("lease.revoke");

  await saveBrowserScreenshot(page, "vault-admin-console.png");
});
