import http from "node:http";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

import { test, expect, saveArtifactScreenshot } from "./fixtures";

const WEBSITE_PORT = 41731;
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

test("docs site builds and renders the relay guide publicly", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 1000 });

  execFileSync("npm", ["--prefix", "website", "run", "docs:build"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const server = spawn("python3", ["-m", "http.server", String(WEBSITE_PORT), "--directory", WEBSITE_DIST_DIR], {
    cwd: process.cwd(),
    stdio: "ignore",
  });

  try {
    await waitForServer(`http://127.0.0.1:${WEBSITE_PORT}/`);

    await page.goto(`http://127.0.0.1:${WEBSITE_PORT}/relay.html`, { waitUntil: "networkidle" });
    await expect(page.locator("main h1").first()).toContainText("Relay");
    await expect(page.locator(".VPSidebar").getByRole("link", { name: "Relay" }).first()).toHaveAttribute("href", /\/relay$/);
    await expect(page.locator("main")).toContainText("Quick Start");
    await expect(page.locator("main")).toContainText("/v1/connector/connect");
    await expect(page.locator("main")).toContainText("sessions:search");
    await saveArtifactScreenshot(page, "website-docs-relay.png");
  } finally {
    server.kill("SIGTERM");
  }
});
