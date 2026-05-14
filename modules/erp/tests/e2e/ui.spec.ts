import { clawApiPath } from "@clawjs/core";
import { expect, saveBrowserScreenshot, test } from "./helpers.ts";

/**
 * Bootstrap a tenant before the test suite runs so the UI has data to show.
 * We do this via the API directly in the first test.
 */
let accessToken = "";
let tenantId = "";
let legalEntityId = "";
let branchId = "";

async function apiPost(url: string, body: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`http://127.0.0.1:4530${url}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function apiGet(url: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(`http://127.0.0.1:4530${url}`, { headers });
  return res.json();
}

test.describe.serial("ERP UI E2E", () => {
  test("bootstrap: login and create test data", async () => {
    // Login
    const loginRes = await apiPost(clawApiPath("auth/admin/login"), {
      email: "admin@erp.local",
      password: "erp-admin",
    });
    accessToken = loginRes.accessToken;
    expect(accessToken).toBeTruthy();

    // Check for existing tenants first
    const tenantsRes = await apiGet(clawApiPath("tenants"));
    if (tenantsRes.tenants && tenantsRes.tenants.length > 0) {
      // Use existing tenant
      tenantId = tenantsRes.tenants[0].id;
      const entitiesRes = await apiGet(clawApiPath(`tenants/${tenantId}/legal-entities`));
      legalEntityId = entitiesRes.legalEntities[0].id;
      const branchesRes = await apiGet(clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}/branches`));
      branchId = branchesRes.branches[0].id;
    } else {
      // Bootstrap tenant
      const slug = `test-corp-${Date.now()}`;
      const bootstrapRes = await apiPost(clawApiPath("tenants/bootstrap"), {
        name: "Test Corp",
        slug,
        baseCurrency: "USD",
      });
      tenantId = bootstrapRes.tenant.id;
      legalEntityId = bootstrapRes.legalEntity.id;
      branchId = bootstrapRes.branch.id;
    }

    // Create items (ignore errors if already exists)
    try {
      await apiPost(clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}/items`), {
        sku: "WIDGET-01", name: "Widget Alpha", kind: "stock",
      });
    } catch { /* may already exist */ }

    // Create a sales quote
    await apiPost(clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}/sales/quotes`), {
      branchId, customerName: "Acme Inc", currency: "USD", totalAmountCents: 150000,
    });

    // Create employee
    await apiPost(clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}/employees`), {
      displayName: "Jane Smith",
    });

    // Create a support ticket
    await apiPost(clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}/support/tickets`), {
      branchId, customerName: "Acme Inc", title: "Widget issue",
    });

    // Create project
    await apiPost(clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}/projects`), {
      name: "Project Alpha",
    });

    // Post a customer invoice (creates GL entries too)
    await apiPost(clawApiPath(`tenants/${tenantId}/legal-entities/${legalEntityId}/ar/invoices`), {
      branchId, customerName: "Acme Inc", currency: "USD", totalAmountCents: 50000,
    });
  });

  test("login page renders and login works", async ({ page, appErrors }) => {
    await page.goto("/");
    // Should see login page
    await expect(page.locator(".login-title")).toHaveText("ERP");
    await expect(page.locator(".login-subtitle")).toContainText("Sign in");

    // Login with default credentials
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await saveBrowserScreenshot(page, "erp-login-success.png");
  });

  test("shell renders all required controls", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Verify all shell test IDs
    await expect(page.getByTestId("shell-tenant-selector")).toBeVisible();
    await expect(page.getByTestId("shell-legal-entity-selector")).toBeVisible();
    await expect(page.getByTestId("shell-branch-switcher")).toBeVisible();
    await expect(page.getByTestId("shell-global-search")).toBeVisible();
    await expect(page.getByTestId("shell-inbox")).toBeVisible();
    await expect(page.getByTestId("shell-approvals")).toBeVisible();
    await expect(page.getByTestId("shell-alerts")).toBeVisible();
    await expect(page.getByTestId("shell-profile")).toBeVisible();
    await expect(page.getByTestId("shell-breadcrumbs")).toBeVisible();
    await expect(page.getByTestId("shell-sync-status")).toBeVisible();
    await expect(page.getByTestId("shell-job-status")).toBeVisible();
    await expect(page.getByTestId("shell-localization-badge")).toBeVisible();

    // Sync status badge
    await expect(page.getByTestId("sync-status-badge")).toContainText("healthy");

    await saveBrowserScreenshot(page, "erp-shell.png");
  });

  test("dashboard renders all mandatory cards", async ({ page, appErrors }) => {
    // Login first
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Wait for dashboard data to load
    await expect(page.getByTestId("dashboard-cash-card")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("dashboard-ar-aging-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-ap-aging-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-revenue-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-margin-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-overdue-approvals-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-inventory-alerts-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-production-bottlenecks-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-payroll-calendar-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-open-tickets-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-activity-feed")).toBeVisible();

    await saveBrowserScreenshot(page, "erp-dashboard.png");
  });

  test("finance: accounts list loads", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Navigate to finance accounts
    await page.click('a[href="/finance"]');
    await expect(page).toHaveURL(/\/finance\/accounts/, { timeout: 5000 });
    await expect(page.getByTestId("finance-accounts-table")).toBeVisible({ timeout: 10000 });

    // Should show accounts from bootstrap
    await expect(page.locator("tbody tr")).toHaveCount(10, { timeout: 5000 }); // 10 default accounts
    await saveBrowserScreenshot(page, "erp-finance-accounts.png");
  });

  test("finance: journal entries list and detail", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/finance/entries");
    await expect(page.getByTestId("finance-entries-table")).toBeVisible({ timeout: 10000 });

    // Click first entry to see detail
    const firstRow = page.locator("tbody tr").first();
    await firstRow.click();
    await expect(page).toHaveURL(/\/finance\/entries\//);

    // Verify detail elements
    await expect(page.getByTestId("gl-entry-header")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("gl-entry-lines")).toBeVisible();
    await expect(page.getByTestId("gl-entry-reverse")).toBeVisible();
    await saveBrowserScreenshot(page, "erp-gl-entry-detail.png");
  });

  test("sales: quotes list renders with data", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/sales/quotes");
    await expect(page.getByTestId("sales-quote-table")).toBeVisible({ timeout: 10000 });

    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Acme Inc").first()).toBeVisible();
    // Create CTA should exist
    await expect(page.getByTestId("sales-quote-create")).toBeVisible();

    await saveBrowserScreenshot(page, "erp-sales-quotes.png");
  });

  test("sales: create quote form uses backend schema", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/sales/quotes/create");
    // Should show the form title from the schema
    await expect(page.locator("h2")).toContainText("Create sales quote", { timeout: 10000 });
    // Should have form groups
    await expect(page.locator(".form-section-title")).toHaveCount(4); // commercial_scope, counterparty, lines, totals
    await saveBrowserScreenshot(page, "erp-sales-quote-create.png");
  });

  test("inventory: items and balances load", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/inventory/items");
    await expect(page.getByTestId("inventory-items-table")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("WIDGET-01").first()).toBeVisible({ timeout: 5000 });
    await saveBrowserScreenshot(page, "erp-inventory-items.png");
  });

  test("hr: employees list loads", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/hr/employees");
    await expect(page.getByTestId("hr-employees-table")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Jane Smith").first()).toBeVisible({ timeout: 5000 });
    await saveBrowserScreenshot(page, "erp-hr-employees.png");
  });

  test("support: ticket queue loads", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/support/queue");
    await expect(page.getByTestId("support-queue-table")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Acme Inc").first()).toBeVisible({ timeout: 5000 });
    await saveBrowserScreenshot(page, "erp-support-queue.png");
  });

  test("navigation: sidebar routes to all modules", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    const modules = [
      { href: "/finance", expected: /\/finance/ },
      { href: "/sales", expected: /\/sales/ },
      { href: "/purchase", expected: /\/purchase/ },
      { href: "/inventory", expected: /\/inventory/ },
      { href: "/mrp", expected: /\/mrp/ },
      { href: "/projects", expected: /\/projects/ },
      { href: "/hr", expected: /\/hr/ },
      { href: "/payroll", expected: /\/payroll/ },
      { href: "/support", expected: /\/support/ },
      { href: "/dms", expected: /\/dms/ },
      { href: "/bi", expected: /\/bi/ },
      { href: "/admin", expected: /\/admin/ },
    ];

    for (const mod of modules) {
      await page.click(`a[href="${mod.href}"]`);
      await expect(page).toHaveURL(mod.expected, { timeout: 5000 });
    }

    await saveBrowserScreenshot(page, "erp-admin-module.png");
  });

  test("command palette opens with Ctrl+K", async ({ page, appErrors }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Open command palette
    await page.keyboard.press("Control+k");
    await expect(page.locator(".command-palette")).toBeVisible({ timeout: 3000 });
    await saveBrowserScreenshot(page, "erp-command-palette.png");

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.locator(".command-palette")).not.toBeVisible();
  });

  test("deep link restoration works", async ({ page, appErrors }) => {
    // First login to get a token
    await page.goto("/");
    await page.fill('input[type="email"]', "admin@erp.local");
    await page.fill('input[type="password"]', "erp-admin");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Now navigate to a deep link
    await page.goto("/finance/accounts");
    await expect(page.getByTestId("finance-accounts-table")).toBeVisible({ timeout: 10000 });

    // Reload and verify recovery
    await page.reload();
    await expect(page.getByTestId("finance-accounts-table")).toBeVisible({ timeout: 10000 });
    await saveBrowserScreenshot(page, "erp-deep-link-recovery.png");
  });
});
