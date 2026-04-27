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

function writeSyntheticSlideImage(targetPath: string) {
  fs.writeFileSync(targetPath, `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#10243f"/>
      <stop offset="0.48" stop-color="#2577a6"/>
      <stop offset="1" stop-color="#f3b36a"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#sky)"/>
  <circle cx="1230" cy="210" r="130" fill="#ffd27c" opacity="0.88"/>
  <path d="M0 745 C270 620 430 665 650 575 C880 480 1095 570 1600 430 L1600 1000 L0 1000 Z" fill="#0e3a4b" opacity="0.88"/>
  <path d="M120 820 C390 700 620 720 900 610 C1110 528 1300 548 1600 490 L1600 1000 L120 1000 Z" fill="#071a26" opacity="0.72"/>
  <g transform="translate(300 180)">
    <rect x="0" y="0" width="300" height="520" rx="24" fill="url(#glass)" opacity="0.72"/>
    <rect x="360" y="120" width="230" height="400" rx="24" fill="url(#glass)" opacity="0.52"/>
    <rect x="650" y="42" width="340" height="478" rx="24" fill="url(#glass)" opacity="0.62"/>
  </g>
</svg>`, "utf8");
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

test("slides image layouts render polished visual slides", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-slides-images-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspaceDir, { recursive: true });
  const imagePath = path.join(workspaceDir, "launch-visual.svg");
  writeSyntheticSlideImage(imagePath);

  const created = parseJson<{ deck: { id: string } }>((await runCli(rootDir, [
    "slides", "create", "Launch Visual System",
    "--theme", "product",
    "--workspace", workspaceDir,
    "--json",
  ])).stdout);

  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "image-left",
    "--heading", "Customer context",
    "--subtitle", "A visual first slide with enough hierarchy to read quickly.",
    "--image", imagePath,
    "--bullet", "Show the environment before explaining the workflow",
    "--bullet", "Keep supporting copy short and spatially balanced",
    "--json",
  ]);
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "image-right",
    "--heading", "Product narrative",
    "--body", "Text and imagery should feel intentionally paired, with the image carrying half of the slide instead of behaving like a small decoration.",
    "--image", imagePath,
    "--json",
  ]);
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "full-bleed-image",
    "--heading", "Launch momentum",
    "--subtitle", "One strong image, one clear message and safe contrast.",
    "--image", imagePath,
    "--json",
  ]);

  const rendered = parseJson<{ validation: { ok: boolean }; rendered: Array<{ format: string; path: string; sizeBytes: number }> }>((await runCli(rootDir, [
    "slides", "render", created.deck.id,
    "--workspace", workspaceDir,
    "--format", "pdf,html,png",
    "--json",
  ])).stdout);
  expect(rendered.validation.ok).toBeTruthy();
  const html = rendered.rendered.find((entry) => entry.format === "html");
  const png = rendered.rendered.find((entry) => entry.format === "png");
  const pdf = rendered.rendered.find((entry) => entry.format === "pdf");
  expect(html).toBeTruthy();
  expect(png?.sizeBytes).toBeGreaterThan(3000);
  expect(pdf?.sizeBytes).toBeGreaterThan(3000);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`file://${html!.path}`);
  await expect(page.locator(".layout-image-left img").first()).toBeVisible();
  await expect(page.locator(".layout-image-right img").first()).toBeVisible();
  await expect(page.locator(".layout-full-bleed-image img").first()).toBeVisible();
  const renderedImages = await page.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0));
  expect(renderedImages).toBeTruthy();
  await page.locator(".layout-full-bleed-image").scrollIntoViewIfNeeded();
  await saveArtifactScreenshot(page, "slides-cli-image-layouts-html.png");
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

test("slides fallback PDF keeps image layouts presentable and normalizes escaped newlines", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-slides-fallback-visual-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspaceDir, { recursive: true });
  const imagePath = path.join(workspaceDir, "visual.svg");
  writeSyntheticSlideImage(imagePath);

  const created = parseJson<{ deck: { id: string } }>((await runCli(rootDir, [
    "slides", "create", "Fallback Visual",
    "--theme", "midnight",
    "--workspace", workspaceDir,
    "--json",
  ])).stdout);

  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "comparison",
    "--heading", "Before vs after",
    "--left", "Old flow\\nManual checks\\nWeak exports",
    "--right", "New flow\\nValidation first\\nPDF ready",
    "--json",
  ]);
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "full-bleed-image",
    "--heading", "Image-led story",
    "--subtitle", "A visual slide should still look intentional when browser rendering falls back.",
    "--image", imagePath,
    "--json",
  ]);
  await runCli(rootDir, [
    "slides", "add", created.deck.id,
    "--workspace", workspaceDir,
    "--layout", "metric-grid",
    "--heading", "Wrapped metrics",
    "--metric", "2.5M impresiones|Awareness",
    "--metric", "18% registro a primer uso|Activacion",
    "--metric", "-22% vs benchmark|CAC",
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
  expect(pdfText).toContain("Manual checks");
  expect(pdfText).toContain("Validation first");
  expect(pdfText).toContain("Image-led story");
  expect(pdfText).toContain("2.5M impresiones");
  expect(pdfText).toContain("Awareness");
  expect(pdfText).not.toContain("\\\\n");
});
