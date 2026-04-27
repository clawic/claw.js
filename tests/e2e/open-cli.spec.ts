import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function clawBin(rootDir: string): string {
  return path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) resolve(address.port);
        else reject(new Error("No port assigned"));
      });
    });
  });
}

async function runCli(rootDir: string, args: string[], options: { reject?: boolean } = {}) {
  try {
    return await execFileAsync(process.execPath, [clawBin(rootDir), ...args], {
      cwd: rootDir,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (options.reject === false && error && typeof error === "object" && "stdout" in error && "stderr" in error) {
      return error as { stdout: string; stderr: string };
    }
    throw error;
  }
}

function stopPid(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already stopped.
  }
}

test("open cli lists dashboards and reports unknown dashboards", async () => {
  const rootDir = process.cwd();
  const list = await runCli(rootDir, ["open"]);
  expect(list.stdout).toContain("memory");
  expect(list.stdout).toContain("storage");
  expect(list.stdout).toContain("http://127.0.0.1:18273");

  const json = await runCli(rootDir, ["open", "list", "--json"]);
  const payload = JSON.parse(json.stdout) as { dashboards: Array<{ surface: string; url: string; aliases: string }> };
  expect(payload.dashboards.some((dashboard) => dashboard.surface === "database" && dashboard.aliases.includes("db"))).toBeTruthy();

  const unknown = await runCli(rootDir, ["open", "missing", "--json", "--no-browser"], { reject: false });
  expect(unknown.stdout).toContain("unknown_dashboard");
});

test("open cli starts memory and storage dashboards without external services", async ({ page }) => {
  test.setTimeout(90_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-open-"));
  const memoryWorkspace = path.join(tempRoot, "memory-workspace");
  const storageWorkspace = path.join(tempRoot, "storage-workspace");
  fs.mkdirSync(memoryWorkspace, { recursive: true });
  fs.mkdirSync(storageWorkspace, { recursive: true });

  const memoryPort = await freePort();
  const memory = JSON.parse((await runCli(rootDir, [
    "open", "memory",
    "--workspace", memoryWorkspace,
    "--port", String(memoryPort),
    "--no-browser",
    "--json",
  ])).stdout) as { url: string; pid: number; surface: string; reused: boolean };

  try {
    expect(memory.surface).toBe("memory");
    expect(memory.reused).toBe(false);
    await page.goto(memory.url);
    await expect(page.locator("body")).toContainText("Memory");
    await saveArtifactScreenshot(page, "open-cli-memory.png");
  } finally {
    stopPid(memory.pid);
  }

  const storagePort = await freePort();
  const storage = JSON.parse((await runCli(rootDir, [
    "open", "storage",
    "--workspace", storageWorkspace,
    "--port", String(storagePort),
    "--no-browser",
    "--json",
  ])).stdout) as { url: string; pid: number; surface: string; reused: boolean };

  try {
    expect(storage.surface).toBe("storage");
    expect(storage.reused).toBe(false);
    expect(storage.url).not.toContain("token=");
    const tokenPath = path.join(os.tmpdir(), "clawjs-open", `storage-token-127.0.0.1-${storagePort}.txt`);
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    await page.goto(`${storage.url}?token=${encodeURIComponent(token)}&bucket=workspace`);
    await expect(page.locator("body")).toContainText("Storage");
    await saveArtifactScreenshot(page, "open-cli-storage.png");
  } finally {
    stopPid(storage.pid);
  }
});

test("open cli refuses occupied ports that it does not own", async () => {
  const rootDir = process.cwd();
  const port = await freePort();
  const server = http.createServer((_request, response) => {
    response.end("busy");
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  try {
    const result = await runCli(rootDir, [
      "open", "memory",
      "--port", String(port),
      "--no-browser",
      "--json",
    ], { reject: false });
    expect(result.stdout).toContain("port_in_use");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
