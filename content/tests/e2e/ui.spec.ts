import { test, expect, saveBrowserScreenshot } from "./helpers.ts";

const ADMIN_EMAIL = "admin@content.local";
const ADMIN_PASSWORD = "content-admin";

async function loginViaApi(baseURL: string) {
  const res = await fetch(`${baseURL}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

async function seedTestData(baseURL: string) {
  const token = await loginViaApi(baseURL);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  await fetch(`${baseURL}/v1/brands`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Test Brand", slug: "test-brand", description: "E2E brand", defaultLocale: "en", voiceSummary: "Professional", tags: ["e2e"] }),
  });

  const brandsRes = await fetch(`${baseURL}/v1/brands`, { headers });
  const { brands } = (await brandsRes.json()) as { brands: Array<{ id: string }> };
  const brandId = brands[0]?.id;
  if (!brandId) return;

  await fetch(`${baseURL}/v1/destinations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      brandId, name: "E2E Webhook", kind: "webhook", publishPolicy: "manual",
      capabilityMap: {
        supportsImmediatePublish: true, supportsScheduling: true,
        supportsText: true, supportsImages: false, supportsVideo: false,
        supportsThread: false, supportsLinkCard: false, supportsRichBlocks: false,
        maxTextLength: 1000, maxAssetCount: 0, requiresApprovalByDefault: false,
      },
    }),
  });

  const entryRes = await fetch(`${baseURL}/v1/entries`, {
    method: "POST",
    headers,
    body: JSON.stringify({ brandId, title: "E2E Entry", summary: "E2E test entry", canonicalBody: "Body content for E2E.", contentType: "post", canonicalFormat: "markdown" }),
  });
  const { entry } = (await entryRes.json()) as { entry: { id: string } };

  await fetch(`${baseURL}/v1/entries/${entry.id}/variants:generate`, { method: "POST", headers });
}

async function loginInBrowser(page: import("@playwright/test").Page) {
  await page.goto("/");
  // If SPA is loaded, we see the login screen
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-testid="shell-sync-status"]', { timeout: 15000 });
}

test.describe("Content SPA", () => {
  test.beforeAll(async ({ browser }) => {
    const baseURL = "http://127.0.0.1:4650";
    await seedTestData(baseURL);
    // Allow time for DB to settle
    const page = await browser.newPage();
    await page.close();
  });

  test("dashboard renders all required cards", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/dashboard");
    await page.waitForSelector('[data-testid="content-dashboard"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="dashboard-drafts-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-scheduled-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-published-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-failed-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-pending-approvals-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-destination-health-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-assets-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-campaigns-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-activity-feed"]')).toBeVisible();

    await saveBrowserScreenshot(page, "content-dashboard.png");
  });

  test("calendar renders with view switcher and grouping", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/calendar");
    await page.waitForSelector('[data-testid="content-calendar"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="calendar-view-switcher"]')).toBeVisible();
    await expect(page.locator('[data-testid="calendar-grouping-control"]')).toBeVisible();

    await page.click("text=Week");
    await expect(page).toHaveURL(/view=week/);

    await page.click("text=Agenda");
    await expect(page).toHaveURL(/view=agenda/);

    await saveBrowserScreenshot(page, "content-calendar.png");
  });

  test("pipeline renders columns", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/pipeline");
    await page.waitForSelector('[data-testid="content-pipeline"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="pipeline-column-draft"]')).toBeVisible();
    await expect(page.locator('[data-testid="pipeline-column-scheduled"]')).toBeVisible();

    await saveBrowserScreenshot(page, "content-pipeline.png");
  });

  test("entries list shows rows and create CTA", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/entries");
    await page.waitForSelector('[data-testid="content-entry-list"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="entry-create-cta"]')).toBeVisible();
    await expect(page.locator('[data-testid="entry-row"]').first()).toBeVisible({ timeout: 5000 });

    await saveBrowserScreenshot(page, "content-entries.png");
  });

  test("composer renders three-panel layout", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/entries");
    await page.waitForSelector('[data-testid="content-entry-list"]', { timeout: 10000 });

    await page.locator('[data-testid="entry-row"] a').first().click();
    await page.click("text=Open in Composer");
    await page.waitForSelector('[data-testid="content-composer"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="composer-canonical-editor"]')).toBeVisible();
    await expect(page.locator('[data-testid="composer-variant-tabs"]')).toBeVisible();
    await expect(page.locator('[data-testid="composer-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="composer-validation-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="composer-publish-bar"]')).toBeVisible();

    await saveBrowserScreenshot(page, "content-composer.png");
  });

  test("destinations show cards with capabilities and test CTA", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/destinations");
    await page.waitForSelector('[data-testid="content-destinations"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="destination-card"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="destination-test-connection"]').first()).toBeVisible();

    await saveBrowserScreenshot(page, "content-destinations.png");
  });

  test("approvals queue renders", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/approvals");
    await page.waitForSelector('[data-testid="content-approvals"]', { timeout: 10000 });

    await saveBrowserScreenshot(page, "content-approvals.png");
  });

  test("publications screen renders", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/publications");
    await page.waitForSelector('[data-testid="content-publications"]', { timeout: 10000 });

    await saveBrowserScreenshot(page, "content-publications.png");
  });

  test("shell controls present", async ({ page, appErrors }) => {
    await loginInBrowser(page);
    await page.goto("/dashboard");
    await page.waitForSelector('[data-testid="shell-sync-status"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="shell-brand-selector"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-destination-scope"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-command-palette"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-approvals"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-jobs"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-sync-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-profile"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-breadcrumbs"]')).toBeVisible();
  });
});
