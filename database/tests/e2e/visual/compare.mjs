/**
 * Visual comparison script: captures screenshots and computed styles from
 * BOTH the real reference admin UI and our ClawJS app, then generates
 * pixel-level diffs and a style mismatch report.
 *
 * Usage:
 *   node tests/e2e/visual/compare.mjs                  # all states
 *   node tests/e2e/visual/compare.mjs --state=01-login  # single state
 *   node tests/e2e/visual/compare.mjs --skip-pb         # skip PB screenshots (reuse existing)
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PB_BIN = "/tmp/pb-bin/reference-server";
const PB_PORT = 8090;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const CLAW_PORT = 4510;
const CLAW_URL = `http://127.0.0.1:${CLAW_PORT}`;
const VIEWPORT = { width: 1440, height: 1040 };

const OUT_DIR = path.join(process.cwd(), "output", "visual-diff");
const PB_SHOTS = path.join(OUT_DIR, "screenshots", "pb");
const CLAW_SHOTS = path.join(OUT_DIR, "screenshots", "claw");
const DIFF_DIR = path.join(OUT_DIR, "diffs");

const PB_ADMIN_EMAIL = "admin@visual.test";
const PB_ADMIN_PASSWORD = "visualtest1234";
const CLAW_ADMIN_EMAIL = "admin@database.local";
const CLAW_ADMIN_PASSWORD = "database-admin";

// ---------------------------------------------------------------------------
// CSS properties to extract
// ---------------------------------------------------------------------------

const CSS_PROPS = [
  "width", "height", "padding", "margin",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "font-family", "font-size", "font-weight", "line-height",
  "color", "background-color", "border", "border-radius",
  "box-shadow", "display", "gap", "min-height", "min-width",
  "opacity", "position",
];

// ---------------------------------------------------------------------------
// Element map: selectors on PB vs Claw for style comparison
// ---------------------------------------------------------------------------

const ELEMENT_MAP = [
  // App sidebar
  { label: "app-sidebar", pb: ".app-sidebar", claw: ".app-sidebar" },
  { label: "menu-item", pb: ".main-menu .menu-item:first-child", claw: ".main-menu .menu-item:first-child" },
  { label: "menu-item-active", pb: ".main-menu .menu-item.current-route,.main-menu .menu-item.active", claw: ".main-menu .menu-item.current-route" },

  // Page sidebar
  { label: "page-sidebar", pb: ".page-sidebar", claw: ".page-sidebar" },
  { label: "sidebar-search-input", pb: ".page-sidebar .search input", claw: "#collection-search" },
  { label: "sidebar-list-item", pb: ".sidebar-list-item:first-of-type", claw: ".sidebar-list-item:first-of-type" },
  { label: "sidebar-footer-btn", pb: ".sidebar-footer .btn", claw: "#new-collection-btn" },

  // Page header
  { label: "page-header", pb: ".page-header", claw: ".page-header" },
  { label: "breadcrumb-last", pb: ".breadcrumbs .breadcrumb-item:last-child", claw: ".breadcrumbs .breadcrumb-item:last-child" },

  // Searchbar
  { label: "searchbar", pb: ".searchbar", claw: ".searchbar" },
  { label: "searchbar-input", pb: ".searchbar input", claw: "#records-filter" },

  // Table
  { label: "table-th", pb: "table th:nth-child(2)", claw: "table th:nth-child(2)" },
  { label: "table-td", pb: "table td:nth-child(2)", claw: "table td:nth-child(2)" },

  // Overlay panel (record drawer)
  { label: "overlay-panel", pb: ".overlay-panel", claw: "#record-drawer .overlay-panel" },
  { label: "panel-header", pb: ".panel-header", claw: "#record-drawer .panel-header" },
  { label: "panel-footer", pb: ".panel-footer", claw: "#record-drawer .panel-footer" },
  { label: "overlay-close", pb: ".overlay-close", claw: "#drawer-close" },

  // Collection edit panel
  { label: "collection-panel", pb: ".collection-panel", claw: "#schema-drawer .collection-panel" },
  { label: "tabs-header", pb: ".tabs-header", claw: ".tabs-header" },
  { label: "tab-item-active", pb: ".tabs-header .tab-item.active", claw: "[data-schema-tab].active" },
  { label: "schema-field", pb: ".schema-field", claw: ".schema-field" },
  { label: "schema-field-header", pb: ".schema-field-header", claw: ".schema-field-header" },

  // Form fields (inside overlay panel content, not sidebar)
  { label: "form-field", pb: ".panel-content .form-field:not(.form-field-toggle)", claw: "#record-drawer .panel-content .form-field:not(.form-field-toggle)" },
  { label: "form-field-label", pb: ".panel-content .form-field:not(.form-field-toggle) label", claw: "#record-drawer .panel-content .form-field:not(.form-field-toggle) label" },
  { label: "form-field-input", pb: ".panel-content .form-field input[type=text]", claw: "#record-drawer .panel-content .form-field input[type=text]" },

  // Labels
  { label: "label-badge", pb: ".label", claw: ".label" },
];

// ---------------------------------------------------------------------------
// State manifest: each entry defines one UI state to capture
// ---------------------------------------------------------------------------

const STATES = [
  {
    name: "01-login",
    async setupPB(page) {
      await page.goto(`${PB_URL}/_/`);
      await page.waitForSelector("input", { timeout: 10000 });
    },
    async setupClaw(page) {
      await page.goto(`${CLAW_URL}/`);
      await page.waitForSelector("#login-form", { timeout: 10000 });
    },
    elements: ELEMENT_MAP.filter(e => false), // login has different structure
  },
  {
    name: "02-collections-sidebar",
    needsAuth: true,
    async setupPB(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
    },
    async setupClaw(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
    },
    elements: ELEMENT_MAP.filter(e =>
      ["app-sidebar", "menu-item", "menu-item-active", "page-sidebar", "sidebar-search-input", "sidebar-list-item", "sidebar-footer-btn"].includes(e.label)
    ),
  },
  {
    name: "03-collections-records",
    needsAuth: true,
    needsSeedData: true,
    async setupPB(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
      await page.locator(".sidebar-list-item").first().click();
      await page.waitForSelector("table", { timeout: 10000 });
      await page.waitForTimeout(500);
    },
    async setupClaw(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
      await page.locator(".sidebar-list-item").first().click();
      await page.waitForSelector("table", { timeout: 10000 });
      await page.waitForTimeout(500);
    },
    elements: ELEMENT_MAP.filter(e =>
      ["page-header", "breadcrumb-last", "searchbar", "searchbar-input", "table-th", "table-td"].includes(e.label)
    ),
  },
  {
    name: "05-record-drawer-new",
    needsAuth: true,
    needsSeedData: true,
    async setupPB(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
      await page.locator(".sidebar-list-item").first().click();
      await page.waitForSelector("table", { timeout: 10000 });
      await page.locator("button:has-text('New record')").first().click();
      await page.waitForSelector(".overlay-panel", { timeout: 5000 });
      await page.waitForTimeout(400);
    },
    async setupClaw(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
      await page.locator(".sidebar-list-item").first().click();
      await page.waitForSelector("table", { timeout: 10000 });
      await page.locator("#new-record-btn").click();
      await page.waitForSelector("#record-drawer:not(.hidden)", { timeout: 5000 });
      await page.waitForTimeout(400);
    },
    elements: ELEMENT_MAP.filter(e =>
      ["overlay-panel", "panel-header", "panel-footer", "overlay-close", "form-field", "form-field-label", "form-field-input"].includes(e.label)
    ),
  },
  {
    name: "07-edit-collection-fields",
    needsAuth: true,
    needsSeedData: true,
    async setupPB(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
      await page.locator(".sidebar-list-item").first().click();
      await page.waitForSelector("table", { timeout: 10000 });
      // Click the gear/settings button to open edit panel
      await page.locator(".page-header .btn-transparent.btn-circle").first().click();
      await page.waitForSelector(".collection-panel", { timeout: 5000 });
      await page.waitForTimeout(500);
    },
    async setupClaw(page) {
      await page.waitForSelector(".sidebar-list-item", { timeout: 10000 });
      await page.locator(".sidebar-list-item").first().click();
      await page.waitForSelector("table", { timeout: 10000 });
      await page.locator("#schema-edit-btn").click();
      await page.waitForSelector("#schema-drawer:not(.hidden)", { timeout: 5000 });
      await page.waitForTimeout(500);
    },
    elements: ELEMENT_MAP.filter(e =>
      ["collection-panel", "tabs-header", "tab-item-active", "schema-field", "schema-field-header", "overlay-close"].includes(e.label)
    ),
  },
  {
    name: "11-modal-new-collection",
    needsAuth: true,
    async setupPB(page) {
      await page.waitForSelector(".sidebar-footer .btn", { timeout: 10000 });
      await page.locator(".sidebar-footer .btn").click();
      await page.waitForSelector(".overlay-panel.popup,.overlay-panel-lg", { timeout: 5000 });
      await page.waitForTimeout(400);
    },
    async setupClaw(page) {
      await page.waitForSelector("#new-collection-btn", { timeout: 10000 });
      await page.locator("#new-collection-btn").click();
      await page.waitForSelector("#schema-drawer:not(.hidden)", { timeout: 5000 });
      await page.waitForTimeout(400);
    },
    elements: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDirs() {
  for (const dir of [PB_SHOTS, CLAW_SHOTS, DIFF_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function extractStyles(page, selector) {
  return page.evaluate(({ selector, props }) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const computed = window.getComputedStyle(el);
    const result = {};
    for (const p of props) {
      result[p] = computed.getPropertyValue(p);
    }
    const box = el.getBoundingClientRect();
    result.__box = { x: box.x, y: box.y, width: box.width, height: box.height };
    return result;
  }, { selector, props: CSS_PROPS });
}

function generatePixelDiff(pbPath, clawPath, diffPath) {
  if (!fs.existsSync(pbPath) || !fs.existsSync(clawPath)) {
    return { diffPixels: -1, totalPixels: 0, diffPercent: 100 };
  }
  const pbImg = PNG.sync.read(fs.readFileSync(pbPath));
  const clawImg = PNG.sync.read(fs.readFileSync(clawPath));

  // Use the smaller dimensions
  const w = Math.min(pbImg.width, clawImg.width);
  const h = Math.min(pbImg.height, clawImg.height);
  const diff = new PNG({ width: w, height: h });

  const diffPixels = pixelmatch(
    pbImg.data, clawImg.data, diff.data,
    w, h,
    { threshold: 0.15, alpha: 0.3 }
  );

  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  const totalPixels = w * h;
  return {
    diffPixels,
    totalPixels,
    diffPercent: ((diffPixels / totalPixels) * 100).toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// PB server management
// ---------------------------------------------------------------------------

let pbProcess = null;
const pbDataDir = "/tmp/pb-visual-test-data";

async function startPB() {
  fs.rmSync(pbDataDir, { recursive: true, force: true });
  fs.mkdirSync(pbDataDir, { recursive: true });

  pbProcess = spawn(PB_BIN, [
    "serve",
    `--http=127.0.0.1:${PB_PORT}`,
    `--dir=${pbDataDir}`,
  ], { stdio: "ignore" });

  await waitForUrl(`${PB_URL}/api/health`);

  // Create superuser
  execSync(`${PB_BIN} superuser create ${PB_ADMIN_EMAIL} ${PB_ADMIN_PASSWORD} --dir=${pbDataDir}`, {
    stdio: "ignore",
  });
}

function stopPB() {
  if (pbProcess) {
    pbProcess.kill();
    pbProcess = null;
  }
}

async function authPB() {
  const r = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  });
  if (!r.ok) {
    // Try the newer endpoint
    const r2 = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
    });
    const data = await r2.json();
    return data.token;
  }
  const data = await r.json();
  return data.token;
}

async function seedPB(token) {
  const headers = { Authorization: token, "Content-Type": "application/json" };

  // Create "posts" collection
  await fetch(`${PB_URL}/api/collections`, {
    method: "POST", headers,
    body: JSON.stringify({
      name: "posts",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", options: { values: ["draft", "published"] } },
        { name: "body", type: "text" },
      ],
    }),
  });

  // Create records
  for (const record of [
    { title: "First Post", status: "published", body: "Hello world" },
    { title: "Draft Article", status: "draft", body: "Work in progress" },
    { title: "Another Post", status: "published", body: "More content" },
  ]) {
    await fetch(`${PB_URL}/api/collections/posts/records`, {
      method: "POST", headers, body: JSON.stringify(record),
    });
  }
}

async function authClaw() {
  const r = await fetch(`${CLAW_URL}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CLAW_ADMIN_EMAIL, password: CLAW_ADMIN_PASSWORD }),
  });
  const data = await r.json();
  return data.accessToken;
}

async function seedClaw(token) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Get namespaces
  const nsRes = await fetch(`${CLAW_URL}/v1/namespaces`, { headers });
  const nsData = await nsRes.json();
  const ns = nsData.items?.[0];
  if (!ns) return;

  // Create "posts" collection
  await fetch(`${CLAW_URL}/v1/namespaces/${ns.id}/collections`, {
    method: "POST", headers,
    body: JSON.stringify({
      name: "posts",
      displayName: "Posts",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", options: ["draft", "published"] },
        { name: "body", type: "text" },
      ],
    }),
  });

  // Create records
  for (const record of [
    { title: "First Post", status: "published", body: "Hello world" },
    { title: "Draft Article", status: "draft", body: "Work in progress" },
    { title: "Another Post", status: "published", body: "More content" },
  ]) {
    await fetch(`${CLAW_URL}/v1/namespaces/${ns.id}/collections/posts/records`, {
      method: "POST", headers, body: JSON.stringify(record),
    });
  }
}

// ---------------------------------------------------------------------------
// Browser login helpers
// ---------------------------------------------------------------------------

async function loginPB(page) {
  await page.goto(`${PB_URL}/_/`);
  await page.waitForSelector("input", { timeout: 10000 });
  // PB login form
  const inputs = await page.locator("input").all();
  if (inputs.length >= 2) {
    await inputs[0].fill(PB_ADMIN_EMAIL);
    await inputs[1].fill(PB_ADMIN_PASSWORD);
  }
  await page.locator("button[type=submit],.btn-next,.btn-lg").first().click();
  await page.waitForSelector(".app-sidebar,.main-menu", { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function loginClaw(page) {
  await page.goto(`${CLAW_URL}/`);
  await page.waitForSelector("#login-form", { timeout: 10000 });
  await page.locator("[data-testid='login-submit']").click();
  await page.waitForSelector("[data-testid='admin-console']", { timeout: 15000 });
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const stateFilter = args.find(a => a.startsWith("--state="))?.split("=")[1];
const skipPB = args.includes("--skip-pb");

async function main() {
  ensureDirs();

  const filteredStates = stateFilter
    ? STATES.filter(s => s.name === stateFilter || s.name.startsWith(stateFilter))
    : STATES;

  if (filteredStates.length === 0) {
    console.error(`No states matching "${stateFilter}". Available: ${STATES.map(s => s.name).join(", ")}`);
    process.exit(1);
  }

  // Start PB if needed
  if (!skipPB) {
    console.log("Starting reference...");
    await startPB();
    console.log("PB started. Seeding data...");
    const pbToken = await authPB();
    await seedPB(pbToken);
    console.log("PB seeded.");
  }

  // Ensure Claw is running
  try {
    await waitForUrl(`${CLAW_URL}/v1/health`, 5000);
  } catch {
    console.error(`Claw server not running at ${CLAW_URL}. Start it first.`);
    stopPB();
    process.exit(1);
  }

  // Seed Claw data
  console.log("Seeding Claw data...");
  const clawToken = await authClaw();
  await seedClaw(clawToken);
  console.log("Claw seeded.");

  const browser = await chromium.launch({ headless: true });
  const styleReport = {};
  const pixelReport = {};

  try {
    for (const state of filteredStates) {
      console.log(`\n--- ${state.name} ---`);

      // PB screenshot
      if (!skipPB) {
        const pbCtx = await browser.newContext({ viewport: VIEWPORT });
        const pbPage = await pbCtx.newPage();
        try {
          if (state.needsAuth) await loginPB(pbPage);
          await state.setupPB(pbPage);
          await pbPage.screenshot({
            path: path.join(PB_SHOTS, `${state.name}.png`),
            fullPage: false,
          });
          console.log(`  PB screenshot captured`);

          // Extract styles
          if (state.elements?.length) {
            for (const el of state.elements) {
              const styles = await extractStyles(pbPage, el.pb);
              if (!styleReport[el.label]) styleReport[el.label] = {};
              styleReport[el.label].pb = styles;
            }
          }
        } catch (err) {
          console.error(`  PB error: ${err.message}`);
        }
        await pbCtx.close();
      }

      // Claw screenshot
      const clawCtx = await browser.newContext({ viewport: VIEWPORT });
      const clawPage = await clawCtx.newPage();
      try {
        if (state.needsAuth) await loginClaw(clawPage);
        await state.setupClaw(clawPage);
        await clawPage.screenshot({
          path: path.join(CLAW_SHOTS, `${state.name}.png`),
          fullPage: false,
        });
        console.log(`  Claw screenshot captured`);

        // Extract styles
        if (state.elements?.length) {
          for (const el of state.elements) {
            const styles = await extractStyles(clawPage, el.claw);
            if (!styleReport[el.label]) styleReport[el.label] = {};
            styleReport[el.label].claw = styles;
          }
        }
      } catch (err) {
        console.error(`  Claw error: ${err.message}`);
      }
      await clawCtx.close();

      // Pixel diff
      const pbShot = path.join(PB_SHOTS, `${state.name}.png`);
      const clawShot = path.join(CLAW_SHOTS, `${state.name}.png`);
      const diffShot = path.join(DIFF_DIR, `${state.name}-diff.png`);

      if (fs.existsSync(pbShot) && fs.existsSync(clawShot)) {
        const result = generatePixelDiff(pbShot, clawShot, diffShot);
        pixelReport[state.name] = result;
        console.log(`  Pixel diff: ${result.diffPercent}% (${result.diffPixels}/${result.totalPixels} pixels)`);
      }
    }
  } finally {
    await browser.close();
    stopPB();
  }

  // Write reports
  fs.writeFileSync(
    path.join(OUT_DIR, "pixel-diff-report.json"),
    JSON.stringify(pixelReport, null, 2)
  );

  // Style diff report
  const mismatches = [];
  for (const [label, data] of Object.entries(styleReport)) {
    if (!data.pb || !data.claw) continue;
    for (const prop of CSS_PROPS) {
      const pbVal = data.pb[prop];
      const clawVal = data.claw[prop];
      if (pbVal !== clawVal && pbVal && clawVal) {
        mismatches.push({ element: label, property: prop, pb: pbVal, claw: clawVal });
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "style-diff-report.json"),
    JSON.stringify({ mismatches, rawStyles: styleReport }, null, 2)
  );

  // Human-readable report
  let report = `VISUAL COMPARISON REPORT\n${"=".repeat(70)}\n\n`;
  report += `PIXEL DIFF SUMMARY\n${"-".repeat(40)}\n`;
  for (const [name, data] of Object.entries(pixelReport)) {
    const status = parseFloat(data.diffPercent) < 0.5 ? "PASS" : "FAIL";
    report += `  ${status}  ${name.padEnd(35)} ${data.diffPercent}%\n`;
  }

  if (mismatches.length) {
    report += `\nSTYLE MISMATCHES (${mismatches.length})\n${"-".repeat(40)}\n`;
    for (const m of mismatches) {
      report += `  ${m.element.padEnd(25)} ${m.property.padEnd(20)} PB: ${m.pb}\n`;
      report += `  ${"".padEnd(25)} ${"".padEnd(20)} CL: ${m.claw}\n\n`;
    }
  } else {
    report += `\nNo style mismatches found.\n`;
  }

  fs.writeFileSync(path.join(OUT_DIR, "report.txt"), report);
  console.log(`\n${report}`);
  console.log(`Reports written to ${OUT_DIR}/`);
}

main().catch(err => {
  console.error(err);
  stopPB();
  process.exit(1);
});
