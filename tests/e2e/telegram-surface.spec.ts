import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";
import { buildTelegramApp } from "../../telegram/src/server/app.ts";

const execFileAsync = promisify(execFile);

function writeChannelsState(workspaceDir: string) {
  const observedDir = path.join(workspaceDir, ".clawjs", "observed");
  fs.mkdirSync(observedDir, { recursive: true });
  fs.writeFileSync(path.join(observedDir, "channels.json"), JSON.stringify({
    accounts: [{
      id: "telegram:test-account",
      provider: "telegram",
      accountId: "test-account",
      label: "Support Telegram",
      enabled: true,
      status: "connected",
      maskedCredential: "vault:****************oken",
      profile: { username: "claw_support_bot", firstName: "Claw Support" },
      updatedAt: new Date().toISOString(),
    }],
    details: {
      telegram: {
        transport: { polling: { active: true }, webhook: { url: "https://example.local/telegram" } },
        knownChats: [{ id: "test-chat-001" }],
        recentErrors: [],
        botProfile: { username: "claw_support_bot", firstName: "Claw Support" },
      },
    },
  }, null, 2));
}

test("telegram surface lists configured bots from an isolated workspace", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-telegram-surface-"));
  writeChannelsState(workspaceDir);

  await execFileAsync("npm", ["--prefix", "telegram/ui", "run", "build"], {
    cwd: rootDir,
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });

  const built = await buildTelegramApp({
    config: { host: "127.0.0.1", port: 0, workspace: workspaceDir },
  });
  await built.app.listen({ host: "127.0.0.1", port: 0 });
  const address = built.app.server.address();
  if (!address || typeof address === "string") throw new Error("failed to resolve telegram surface address");

  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole("heading", { name: "Support Telegram" })).toBeVisible();
    await expect(page.getByText("@claw_support_bot").first()).toBeVisible();
    await expect(page.getByText("polling active").first()).toBeVisible();

    await saveArtifactScreenshot(page, "telegram-surface.png");
  } finally {
    await built.app.close();
  }
});
