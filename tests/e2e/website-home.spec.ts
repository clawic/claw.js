import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

import { test, expect, saveArtifactScreenshot } from "./fixtures";

const WEBSITE_PORT = 41730;
const WEBSITE_DIST_DIR = path.join(process.cwd(), "website", "dist");

async function waitForServer(url: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const ready = await new Promise<boolean>((resolve) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) === 200);
      });
      request.on("error", () => resolve(false));
    });

    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for website server at ${url}`);
}

test("website landing keeps its own marketing typography", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 1000 });

  execFileSync("npm", ["--prefix", "website", "run", "build"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const server = spawn("python3", ["-m", "http.server", String(WEBSITE_PORT), "--directory", WEBSITE_DIST_DIR], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  try {
    await waitForServer(`http://127.0.0.1:${WEBSITE_PORT}/`);

    await page.goto(`http://127.0.0.1:${WEBSITE_PORT}/`, { waitUntil: "networkidle" });
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", "/favicon.ico");
    await expect(page.locator(".nav__logo img")).toHaveAttribute("src", "/logo.png");
    await expect(page.locator(".hero__orbit-hub img")).toHaveAttribute("src", "/logo.png");
    await expect(page.locator('link[href*="fonts.googleapis.com/css2"]')).toHaveCount(1);
    await expect.poll(async () => page.evaluate(() => {
      const rootStyles = getComputedStyle(document.documentElement);
      return {
        sans: rootStyles.getPropertyValue("--font-sans").trim(),
        mono: rootStyles.getPropertyValue("--font-mono").trim(),
      };
    })).toMatchObject({
      sans: expect.stringContaining("Inter"),
      mono: expect.stringContaining("JetBrains Mono"),
    });
    expect(requests.some((url) => new URL(url).pathname.startsWith("/fonts/"))).toBe(false);

    const sponsorCards = page.locator('a[aria-label="Landscape AI on the App Store"]');
    await expect(sponsorCards).toHaveCount(1);
    await expect(page.locator(".sponsor-strip .sponsor-card__name")).toHaveText("Landscape AI");
    await expect(page.locator(".sponsor-strip img")).toHaveAttribute("src", "/sponsors/landscape-ai.png");
    await expect(page.locator(".sponsor-strip .sponsor-strip__label")).toHaveText("Sponsors");
    await expect(page.locator(".sponsor-strip__cta")).toHaveText("Become a sponsor");
    await expect(sponsorCards.first()).toHaveAttribute("href", "https://apps.apple.com/app/id6745303581");

    const outputDir = path.join(process.cwd(), "artifacts", "e2e");
    fs.mkdirSync(outputDir, { recursive: true });
    await page.locator(".sponsor-strip--footer").scrollIntoViewIfNeeded();
    await page.locator(".sponsor-strip").screenshot({ path: path.join(outputDir, "website-home-sponsor-compact.png") });

    await saveArtifactScreenshot(page, "website-home.png");
  } finally {
    server.kill("SIGTERM");
  }
});
