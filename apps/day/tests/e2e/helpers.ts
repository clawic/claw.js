import fs from "node:fs";
import path from "node:path";

import { expect, test as base } from "@playwright/test";

type AppErrors = {
  consoleErrors: string[];
  pageErrors: string[];
  responseErrors: string[];
  requestFailures: string[];
};

function shouldIgnoreResponse(url: string, status: number): boolean {
  return status === 404 && url.endsWith("/favicon.ico");
}

export const test = base.extend<{ appErrors: AppErrors }>({
  appErrors: async ({ page }, use) => {
    const appErrors: AppErrors = {
      consoleErrors: [],
      pageErrors: [],
      responseErrors: [],
      requestFailures: [],
    };
    page.on("console", (message) => {
      if (message.type() === "error") appErrors.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      appErrors.pageErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !shouldIgnoreResponse(response.url(), response.status())) {
        appErrors.responseErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      appErrors.requestFailures.push(`${request.failure()?.errorText || "unknown"} ${request.url()}`);
    });
    await use(appErrors);
    expect([
      ...appErrors.consoleErrors,
      ...appErrors.pageErrors,
      ...appErrors.responseErrors,
      ...appErrors.requestFailures,
    ]).toEqual([]);
  },
});

export { expect };

export async function saveBrowserScreenshot(page: import("@playwright/test").Page, name: string) {
  const targetDir = path.join(process.cwd(), "artifacts");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, name);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}
