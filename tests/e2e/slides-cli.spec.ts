import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function cliPath(rootDir: string) {
  return path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
}

async function runCli(rootDir: string, args: string[], options: { reject?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  try {
    return await execFileAsync(process.execPath, [cliPath(rootDir), ...args], {
      cwd: rootDir,
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (options.reject === false && error && typeof error === "object" && "stdout" in error && "stderr" in error) {
      return error as { stdout: string; stderr: string };
    }
    throw error;
  }
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

test("slides cli creates, validates, renders, shares, and downloads a deck without real services", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-slides-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const downloadPath = path.join(tempRoot, "downloaded.pdf");

  const created = parseJson<{ deck: { id: string }; path: string }>((await runCli(rootDir, [
    "slides", "create", "Q2 Product Update",
    "--theme", "studio",
    "--workspace", workspaceDir,
    "--agent-id", "test-agent",
    "--json",
  ])).stdout);

  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "title",
    "--heading", "Q2 Product Update",
    "--subtitle", "A concise update on product momentum and next priorities",
    "--json",
  ]);
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "title-bullets",
    "--heading", "What changed",
    "--bullet", "Activation moved from trial setup to guided project creation",
    "--bullet", "Mobile viewing paths now prioritize PDF delivery",
    "--bullet", "Agents can self-correct slides before rendering",
    "--json",
  ]);
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "metric-grid",
    "--heading", "Launch coverage",
    "--metric", "4|Core workflows|Create, validate, render and share",
    "--metric", "10|Visual themes|Distinct deck aesthetics",
    "--metric", "15|Slide layouts|Reusable presentation structures",
    "--json",
  ]);

  const rendered = parseJson<{
    validation: { ok: boolean };
    rendered: Array<{ format: string; path: string; sizeBytes: number; mediaId?: string }>;
  }>((await runCli(rootDir, [
    "slides", "render", created.deck.id,
    "--workspace", workspaceDir,
    "--format", "pdf,pptx,html,png",
    "--json",
  ])).stdout);

  expect(rendered.validation.ok).toBeTruthy();
  for (const format of ["pdf", "pptx", "html", "png"]) {
    const output = rendered.rendered.find((entry) => entry.format === format);
    expect(output, `missing ${format}`).toBeTruthy();
    expect(fs.existsSync(output!.path)).toBeTruthy();
    expect(output!.sizeBytes).toBeGreaterThan(1000);
    expect(output!.mediaId).toBeTruthy();
  }

  const pdf = rendered.rendered.find((entry) => entry.format === "pdf")!;
  const html = rendered.rendered.find((entry) => entry.format === "html")!;
  const pptx = rendered.rendered.find((entry) => entry.format === "pptx")!;
  expect(fs.readFileSync(pdf.path).subarray(0, 4).toString()).toBe("%PDF");
  expect(fs.readFileSync(pptx.path).subarray(0, 2).toString()).toBe("PK");

  const shared = parseJson<{ share: { url: string }; output: { mediaId: string } }>((await runCli(rootDir, [
    "slides", "share", created.deck.id,
    "--workspace", workspaceDir,
    "--format", "pdf",
    "--json",
  ])).stdout);
  expect(shared.share.url).toContain("clawjs://media-gallery/");

  const shareList = (await runCli(rootDir, ["media", "share", "list", "--workspace", workspaceDir])).stdout;
  expect(shareList).toContain(shared.share.url);

  await runCli(rootDir, [
    "media", "download",
    "--workspace", workspaceDir,
    "--media-id", shared.output.mediaId,
    "--out", downloadPath,
    "--json",
  ]);
  expect(fs.readFileSync(downloadPath).subarray(0, 4).toString()).toBe("%PDF");

  await page.goto(`file://${html.path}`);
  await expect(page.locator(".slide").first()).toBeVisible();
  await expect(page.locator("text=Q2 Product Update").first()).toBeVisible();
  await expect(page.locator("text=Core workflows").first()).toBeVisible();
  await expect(page.locator("text=Create, validate, render and share").first()).toBeVisible();
  await saveArtifactScreenshot(page, "slides-cli-rendered-html.png");
});

test("slides validation blocks overflow by default and force preserves the report", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-slides-overflow-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const created = parseJson<{ deck: { id: string } }>((await runCli(rootDir, [
    "slides", "create", "Overflow Check",
    "--theme", "paper",
    "--workspace", workspaceDir,
    "--json",
  ])).stdout);
  const longBullet = "This bullet is intentionally far too long for a polished presentation layout and should trip the red validation state because it will not fit cleanly inside a normal slide body without shrinking past the intended visual guardrails.";
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "title-bullets",
    "--heading", "Crowded slide",
    "--bullet", longBullet,
    "--json",
  ], { reject: false });

  const blocked = await runCli(rootDir, [
    "slides", "render", created.deck.id,
    "--workspace", workspaceDir,
    "--format", "pdf",
    "--json",
  ], { reject: false });
  const blockedPayload = parseJson<{ validation: { ok: boolean; errorCount: number }; rendered: unknown[] }>(blocked.stdout);
  expect(blockedPayload.validation.ok).toBeFalsy();
  expect(blockedPayload.validation.errorCount).toBeGreaterThan(0);
  expect(blockedPayload.rendered).toEqual([]);

  const forced = parseJson<{ validation: { ok: boolean; errorCount: number }; rendered: Array<{ format: string; path: string }> }>((await runCli(rootDir, [
    "slides", "render", created.deck.id,
    "--workspace", workspaceDir,
    "--format", "pdf",
    "--force",
    "--json",
  ])).stdout);
  expect(forced.validation.ok).toBeFalsy();
  expect(forced.validation.errorCount).toBeGreaterThan(0);
  expect(forced.rendered[0]?.format).toBe("pdf");
  expect(fs.existsSync(forced.rendered[0]!.path)).toBeTruthy();
});

test("slides pdf fallback remains readable when browser rendering is unavailable", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-slides-pdf-fallback-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const created = parseJson<{ deck: { id: string } }>((await runCli(rootDir, [
    "slides", "create", "Twend Launch",
    "--theme", "executive",
    "--workspace", workspaceDir,
    "--json",
  ])).stdout);

  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "title",
    "--heading", "Twend: estrategia de lanzamiento",
    "--subtitle", "Problema, prioridades, transición y cobertura V1",
    "--json",
  ]);
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "title-bullets",
    "--heading", "Prioridades de lanzamiento",
    "--bullet", "Validar que el mensaje del producto se entienda en segundos",
    "--bullet", "Reducir el tiempo hasta el primer resultado útil",
    "--bullet", "Aprender rápido con señales de adopción y retención inicial",
    "--json",
  ]);

  const rendered = parseJson<{ rendered: Array<{ format: string; path: string; metadata?: Record<string, unknown> }> }>((await runCli(rootDir, [
    "slides", "render", created.deck.id,
    "--workspace", workspaceDir,
    "--format", "pdf",
    "--json",
  ], { env: { CLAWJS_SLIDES_DISABLE_BROWSER: "1" } })).stdout);
  const pdf = rendered.rendered.find((entry) => entry.format === "pdf");
  expect(pdf).toBeTruthy();
  expect(pdf?.metadata?.renderer).toBe("node-fallback");
  const pdfText = fs.readFileSync(pdf!.path, "latin1");
  expect(pdfText.startsWith("%PDF")).toBeTruthy();
  expect(pdfText).toContain("Prioridades de lanzamiento");
  expect(pdfText).toContain("resultado \\372til");
});
