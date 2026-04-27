import fs from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { pathToFileURL } from "url";

export const SLIDE_LAYOUTS = [
  "title",
  "section",
  "title-bullets",
  "statement",
  "two-column",
  "image-left",
  "image-right",
  "full-bleed-image",
  "quote",
  "metric-grid",
  "timeline",
  "comparison",
  "process",
  "table-lite",
  "closing",
] as const;

export const SLIDE_THEMES = [
  "editorial",
  "studio",
  "midnight",
  "signal",
  "paper",
  "executive",
  "product",
  "mono",
  "warm",
  "claw",
] as const;

export type SlideLayout = typeof SLIDE_LAYOUTS[number];
export type SlideTheme = typeof SLIDE_THEMES[number];
export type SlideSeverity = "green" | "yellow" | "orange" | "red";
export type SlideRenderFormat = "pdf" | "pptx" | "html" | "png";

export interface SlideMetric {
  label: string;
  value: string;
  detail?: string;
}

export interface SlideImageRef {
  src: string;
  alt?: string;
  caption?: string;
}

export interface SlideManifestSlide {
  id: string;
  layout: SlideLayout;
  title?: string;
  heading?: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  left?: string;
  right?: string;
  quote?: string;
  attribution?: string;
  image?: SlideImageRef;
  metrics?: SlideMetric[];
  steps?: string[];
  rows?: string[][];
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface SlideManifestOutput {
  format: SlideRenderFormat;
  path: string;
  mediaId?: string;
  createdAt: string;
  sizeBytes: number;
}

export interface SlideDeckManifest {
  schemaVersion: 1;
  id: string;
  title: string;
  theme: SlideTheme;
  author: {
    agentId?: string;
    name?: string;
  };
  slides: SlideManifestSlide[];
  metadata: Record<string, unknown>;
  outputs: SlideManifestOutput[];
  createdAt: string;
  updatedAt: string;
}

export interface SlideValidationIssue {
  slideId?: string;
  slideIndex?: number;
  field: string;
  severity: SlideSeverity;
  message: string;
  count?: number;
  min?: number;
  max?: number;
}

export interface SlideValidationReport {
  ok: boolean;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: SlideValidationIssue[];
}

export interface SlidesCliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName: string;
}

export interface SlidesCliOptions {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  agentId?: string;
  wantsJson: boolean;
  context: SlidesCliContext;
  registerOutput?: (input: { filePath: string; name: string; mimeType: string; kind: "document" | "image"; sourceText: string }) => Promise<{ mediaId: string }>;
  createMediaShare?: (input: { mediaId?: string; label?: string; ttlMs?: number; expiresAt?: string | null; filters?: { query?: string; kind?: "document" | "image"; workspaceId?: string; agentId?: string } }) => Promise<{ id: string; url: string }>;
}

const SLIDES_OK = 0;
const SLIDES_FAILURE = 1;
const SLIDES_USAGE = 64;
const SLIDE_W = 1280;
const SLIDE_H = 720;
const PPTX_W = 12192000;
const PPTX_H = 6858000;

type SlideThemeStyle = {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  panel: string;
  font: string;
  mono: string;
};

const THEME_STYLES: Record<SlideTheme, SlideThemeStyle> = {
  editorial: { bg: "#f5f0e8", fg: "#151719", muted: "#6d655d", accent: "#b9412f", accent2: "#244f7a", panel: "#fffaf2", font: "Georgia, 'Times New Roman', serif", mono: "'SFMono-Regular', Consolas, monospace" },
  studio: { bg: "#f8f7f3", fg: "#1d2328", muted: "#65717b", accent: "#0f8b8d", accent2: "#f25f5c", panel: "#ffffff", font: "Inter, Arial, sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  midnight: { bg: "#09111f", fg: "#f6f8fb", muted: "#a9b7c8", accent: "#57c7ff", accent2: "#a78bfa", panel: "#111f33", font: "Inter, Arial, sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  signal: { bg: "#0e1512", fg: "#f3f8f1", muted: "#a8b8ad", accent: "#59d98e", accent2: "#ffd166", panel: "#17231d", font: "Aptos, Arial, sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  paper: { bg: "#fbfaf7", fg: "#202124", muted: "#6f6f68", accent: "#3867d6", accent2: "#e15f41", panel: "#f0eee8", font: "Aptos, Arial, sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  executive: { bg: "#f6f7f9", fg: "#111827", muted: "#5f6b7a", accent: "#1f4e79", accent2: "#9a6a19", panel: "#ffffff", font: "Arial, sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  product: { bg: "#f7fbff", fg: "#112033", muted: "#617084", accent: "#0d9488", accent2: "#2563eb", panel: "#ffffff", font: "Inter, Arial, sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  mono: { bg: "#f4f4f2", fg: "#171717", muted: "#686868", accent: "#111111", accent2: "#777777", panel: "#ffffff", font: "'SFMono-Regular', Consolas, monospace", mono: "'SFMono-Regular', Consolas, monospace" },
  warm: { bg: "#fff7ed", fg: "#241a14", muted: "#7c6254", accent: "#c2410c", accent2: "#0f766e", panel: "#fffbf4", font: "Aptos, Arial, sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  claw: { bg: "#f7f7f4", fg: "#141a1f", muted: "#62707d", accent: "#15a3a3", accent2: "#315c9c", panel: "#ffffff", font: "'Source Sans 3', Arial, sans-serif", mono: "'Ubuntu Mono', 'SFMono-Regular', monospace" },
};

const FIELD_BUDGETS: Record<string, { min?: number; green: number; orange: number; red: number }> = {
  heading: { min: 8, green: 58, orange: 88, red: 118 },
  title: { min: 8, green: 58, orange: 88, red: 118 },
  subtitle: { min: 20, green: 120, orange: 170, red: 230 },
  body: { min: 30, green: 260, orange: 390, red: 520 },
  bullet: { min: 18, green: 72, orange: 105, red: 140 },
  quote: { min: 20, green: 180, orange: 250, red: 340 },
  caption: { green: 90, orange: 130, red: 170 },
  metric: { green: 48, orange: 72, red: 96 },
  "table-cell": { green: 42, orange: 62, red: 84 },
  notes: { green: 700, orange: 1200, red: 1800 },
};

export async function runSlidesCli(options: SlidesCliOptions): Promise<number> {
  const [, command, target] = options.positionals;
  const { context, wantsJson, flags } = options;
  if (command === "themes") {
    writeOutput(options, { themes: SLIDE_THEMES.map((id) => ({ id, ...THEME_STYLES[id] })) }, SLIDE_THEMES.join("\n"));
    return SLIDES_OK;
  }
  if (command === "layouts") {
    writeOutput(options, { layouts: SLIDE_LAYOUTS.map((id) => ({ id, budgets: layoutBudgets(id) })) }, SLIDE_LAYOUTS.join("\n"));
    return SLIDES_OK;
  }
  if (command === "create") {
    const title = joinedPositionals(options.positionals, 2) || flags.title || flags.name;
    if (!title) {
      context.stderr.write(`Usage: ${context.binName} slides create <title> --theme THEME\n`);
      return SLIDES_USAGE;
    }
    const theme = parseTheme(flags.theme || "editorial");
    if (!theme) {
      context.stderr.write(`Unknown slide theme: ${flags.theme}\n`);
      return SLIDES_USAGE;
    }
    const deck = createDeckManifest({
      title,
      theme,
      agentId: flags.agent || options.agentId,
      author: flags.author,
      metadata: parseObjectFlag(flags["metadata-json"]),
    });
    const deckPath = deckManifestPath(options.workspaceRoot, deck.id);
    writeDeck(deckPath, deck);
    writeOutput(options, { deck, path: deckPath }, deckPath);
    return SLIDES_OK;
  }
  if (command === "add") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} slides add <deck> --layout LAYOUT [--heading TEXT]\n`);
      return SLIDES_USAGE;
    }
    const resolved = readDeckByRef(options.workspaceRoot, context.cwd, target);
    const layout = parseLayout(flags.layout || "title-bullets");
    if (!layout) {
      context.stderr.write(`Unknown slide layout: ${flags.layout}\n`);
      return SLIDES_USAGE;
    }
    const slide = buildSlideFromFlags(layout, options.argv, flags);
    resolved.deck.slides.push(slide);
    resolved.deck.updatedAt = nowIso();
    writeDeck(resolved.path, resolved.deck);
    const report = validateSlideDeck(resolved.deck, { cwd: path.dirname(resolved.path) });
    writeOutput(options, { deck: resolved.deck, slide, validation: report, path: resolved.path }, `${slide.id}\n`);
    return report.errorCount > 0 ? SLIDES_FAILURE : SLIDES_OK;
  }
  if (command === "validate") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} slides validate <deck>\n`);
      return SLIDES_USAGE;
    }
    const resolved = readDeckByRef(options.workspaceRoot, context.cwd, target);
    const report = validateSlideDeck(resolved.deck, { cwd: path.dirname(resolved.path) });
    writeOutput(options, report, formatValidationReport(report));
    return report.errorCount > 0 ? SLIDES_FAILURE : SLIDES_OK;
  }
  if (command === "render") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} slides render <deck> --format pdf,pptx,html,png\n`);
      return SLIDES_USAGE;
    }
    const resolved = readDeckByRef(options.workspaceRoot, context.cwd, target);
    const report = validateSlideDeck(resolved.deck, { cwd: path.dirname(resolved.path) });
    const force = options.argv.includes("--force") || flags.force === "true";
    if (report.errorCount > 0 && !force) {
      writeOutput(options, { validation: report, rendered: [] }, formatValidationReport(report));
      return SLIDES_FAILURE;
    }
    if (!wantsJson && report.issues.length > 0) {
      context.stderr.write(`${formatValidationReport(report)}\n`);
    }
    const formats = parseFormats(flags.format || flags.formats || "pdf");
    const rendered = await renderDeck(resolved.deck, {
      formats,
      manifestPath: resolved.path,
      outputDir: flags.out || flags.output ? path.resolve(context.cwd, flags.out || flags.output) : deckOutputDir(options.workspaceRoot, resolved.deck.id),
      cwd: path.dirname(resolved.path),
    });
    for (const output of rendered) {
      const registerPath = output.format === "png" ? firstPngInDir(output.path) : output.path;
      if (!registerPath) continue;
      const media = await options.registerOutput?.({
        filePath: registerPath,
        name: path.basename(registerPath),
        mimeType: mimeTypeForFormat(output.format),
        kind: output.format === "png" ? "image" : "document",
        sourceText: `${resolved.deck.title} ${output.format} slide deck`,
      });
      if (media?.mediaId) output.mediaId = media.mediaId;
    }
    resolved.deck.outputs = [...rendered, ...resolved.deck.outputs.filter((output) => !rendered.some((next) => next.format === output.format))];
    resolved.deck.updatedAt = nowIso();
    writeDeck(resolved.path, resolved.deck);
    writeOutput(options, { deck: resolved.deck, validation: report, rendered }, rendered.map((output) => output.path).join("\n"));
    return SLIDES_OK;
  }
  if (command === "share") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} slides share <deck> [--format pdf]\n`);
      return SLIDES_USAGE;
    }
    const format = parseFormats(flags.format || "pdf")[0] || "pdf";
    const resolved = readDeckByRef(options.workspaceRoot, context.cwd, target);
    let output = newestOutput(resolved.deck, format);
    if (!output || !fs.existsSync(output.path)) {
      const report = validateSlideDeck(resolved.deck, { cwd: path.dirname(resolved.path) });
      if (report.errorCount > 0 && !options.argv.includes("--force")) {
        writeOutput(options, { validation: report, share: null }, formatValidationReport(report));
        return SLIDES_FAILURE;
      }
      const [rendered] = await renderDeck(resolved.deck, {
        formats: [format],
        manifestPath: resolved.path,
        outputDir: deckOutputDir(options.workspaceRoot, resolved.deck.id),
        cwd: path.dirname(resolved.path),
      });
      const media = await options.registerOutput?.({
        filePath: rendered.format === "png" ? firstPngInDir(rendered.path) ?? rendered.path : rendered.path,
        name: path.basename(rendered.format === "png" ? firstPngInDir(rendered.path) ?? rendered.path : rendered.path),
        mimeType: mimeTypeForFormat(rendered.format),
        kind: rendered.format === "png" ? "image" : "document",
        sourceText: `${resolved.deck.title} ${rendered.format} slide deck`,
      });
      if (media?.mediaId) rendered.mediaId = media.mediaId;
      resolved.deck.outputs = [rendered, ...resolved.deck.outputs.filter((candidate) => candidate.format !== rendered.format)];
      resolved.deck.updatedAt = nowIso();
      writeDeck(resolved.path, resolved.deck);
      output = rendered;
    }
    if (!output.mediaId) {
      const media = await options.registerOutput?.({
        filePath: output.format === "png" ? firstPngInDir(output.path) ?? output.path : output.path,
        name: path.basename(output.format === "png" ? firstPngInDir(output.path) ?? output.path : output.path),
        mimeType: mimeTypeForFormat(output.format),
        kind: output.format === "png" ? "image" : "document",
        sourceText: `${resolved.deck.title} ${output.format} slide deck`,
      });
      output.mediaId = media?.mediaId;
      writeDeck(resolved.path, resolved.deck);
    }
    if (!output.mediaId) {
      context.stderr.write("Unable to register slide output for sharing.\n");
      return SLIDES_FAILURE;
    }
    const shareInput = {
      label: flags.label || `${resolved.deck.title} ${format.toUpperCase()}`,
      expiresAt: flags["expires-at"],
      ttlMs: parseDurationMs(flags.ttl || flags["ttl-ms"]),
    };
    let share: { id: string; url: string } | undefined;
    try {
      share = await options.createMediaShare?.({
        ...shareInput,
        mediaId: output.mediaId,
      });
    } catch {
      share = await options.createMediaShare?.({
        ...shareInput,
        filters: {
          query: path.basename(output.path),
          kind: output.format === "png" ? "image" : "document",
        },
      });
    }
    if (!share) {
      context.stderr.write("Unable to create slide share.\n");
      return SLIDES_FAILURE;
    }
    writeOutput(options, { share, output, deck: resolved.deck }, share.url);
    return SLIDES_OK;
  }

  context.stderr.write(`Usage: ${context.binName} slides create|add|validate|render|share|themes|layouts\n`);
  return SLIDES_USAGE;
}

export function createDeckManifest(input: {
  title: string;
  theme: SlideTheme;
  agentId?: string;
  author?: string;
  metadata?: Record<string, unknown>;
}): SlideDeckManifest {
  const id = `${slugify(input.title)}-${randomBytes(3).toString("hex")}`;
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    id,
    title: input.title,
    theme: input.theme,
    author: {
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.author ? { name: input.author } : {}),
    },
    slides: [],
    metadata: input.metadata ?? {},
    outputs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function validateSlideDeck(deck: SlideDeckManifest, options: { cwd: string }): SlideValidationReport {
  const issues: SlideValidationIssue[] = [];
  if (deck.schemaVersion !== 1) {
    issues.push({ field: "schemaVersion", severity: "red", message: "Unsupported slide deck schema." });
  }
  if (!parseTheme(deck.theme)) {
    issues.push({ field: "theme", severity: "red", message: `Unsupported theme: ${deck.theme}` });
  }
  if (deck.slides.length === 0) {
    issues.push({ field: "slides", severity: "red", message: "Deck has no slides." });
  }
  deck.slides.forEach((slide, index) => {
    if (!parseLayout(slide.layout)) {
      issues.push(issue(slide, index, "layout", "red", `Unsupported layout: ${slide.layout}`));
      return;
    }
    validateTextField(issues, slide, index, "heading", slide.heading ?? slide.title);
    validateTextField(issues, slide, index, "subtitle", slide.subtitle);
    validateTextField(issues, slide, index, "body", slide.body);
    validateTextField(issues, slide, index, "quote", slide.quote);
    validateTextField(issues, slide, index, "notes", slide.notes);
    for (const [bulletIndex, bullet] of (slide.bullets ?? []).entries()) {
      validateTextField(issues, slide, index, `bullet[${bulletIndex}]`, bullet, "bullet");
    }
    for (const [stepIndex, step] of (slide.steps ?? []).entries()) {
      validateTextField(issues, slide, index, `step[${stepIndex}]`, step, "bullet");
    }
    for (const [metricIndex, metric] of (slide.metrics ?? []).entries()) {
      validateTextField(issues, slide, index, `metric[${metricIndex}]`, `${metric.value} ${metric.label} ${metric.detail ?? ""}`.trim(), "metric");
    }
    for (const [rowIndex, row] of (slide.rows ?? []).entries()) {
      for (const [cellIndex, cell] of row.entries()) {
        validateTextField(issues, slide, index, `rows[${rowIndex}][${cellIndex}]`, cell, "table-cell");
      }
    }
    if ((slide.bullets?.length ?? 0) > maxBulletsForLayout(slide.layout)) {
      issues.push(issue(slide, index, "bullets", "red", `${slide.layout} supports at most ${maxBulletsForLayout(slide.layout)} bullets.`, slide.bullets?.length, undefined, maxBulletsForLayout(slide.layout)));
    }
    if ((slide.steps?.length ?? 0) > 6) {
      issues.push(issue(slide, index, "steps", "red", "Process/timeline slides support at most 6 steps.", slide.steps?.length, undefined, 6));
    }
    if ((slide.metrics?.length ?? 0) > 6) {
      issues.push(issue(slide, index, "metrics", "red", "Metric-grid slides support at most 6 metrics.", slide.metrics?.length, undefined, 6));
    }
    if ((slide.rows?.length ?? 0) > 7) {
      issues.push(issue(slide, index, "rows", "red", "Table-lite slides support at most 7 rows.", slide.rows?.length, undefined, 7));
    }
    validateImage(issues, slide, index, options.cwd);
  });
  const errorCount = issues.filter((entry) => entry.severity === "red").length;
  const warningCount = issues.length - errorCount;
  return {
    ok: errorCount === 0,
    issueCount: issues.length,
    errorCount,
    warningCount,
    issues,
  };
}

function validateTextField(
  issues: SlideValidationIssue[],
  slide: SlideManifestSlide,
  index: number,
  field: string,
  value: string | undefined,
  budgetKey = field.replace(/\[\d+\]/g, ""),
): void {
  const text = value?.trim();
  if (!text) return;
  const budget = FIELD_BUDGETS[budgetKey];
  if (!budget) return;
  const count = text.length;
  if (budget.min && count < budget.min) {
    issues.push(issue(slide, index, field, "yellow", `${field} is short; it may feel underdeveloped.`, count, budget.min, budget.green));
    return;
  }
  if (count > budget.red) {
    issues.push(issue(slide, index, field, "red", `${field} is too long and likely to overflow.`, count, undefined, budget.red));
    return;
  }
  if (count > budget.orange) {
    issues.push(issue(slide, index, field, "orange", `${field} is long; consider shortening before export.`, count, undefined, budget.orange));
    return;
  }
  if (count > budget.green) {
    issues.push(issue(slide, index, field, "yellow", `${field} is above the ideal range.`, count, undefined, budget.green));
  }
}

function validateImage(issues: SlideValidationIssue[], slide: SlideManifestSlide, index: number, cwd: string): void {
  if (!slide.image?.src) {
    if (["image-left", "image-right", "full-bleed-image"].includes(slide.layout)) {
      issues.push(issue(slide, index, "image", "red", `${slide.layout} requires an image.`));
    }
    return;
  }
  const imagePath = resolveInputPath(cwd, slide.image.src);
  if (!fs.existsSync(imagePath)) {
    issues.push(issue(slide, index, "image", "red", `Image does not exist: ${slide.image.src}`));
    return;
  }
  const dimensions = readImageDimensions(imagePath);
  if (!dimensions) {
    issues.push(issue(slide, index, "image", "orange", `Image dimensions could not be read: ${slide.image.src}`));
    return;
  }
  const aspect = dimensions.width / dimensions.height;
  if (aspect > 4 || aspect < 0.25) {
    issues.push(issue(slide, index, "image", "red", `Image aspect ratio is unsafe for slide layouts: ${aspect.toFixed(2)}`));
  }
}

async function renderDeck(
  deck: SlideDeckManifest,
  options: { formats: SlideRenderFormat[]; outputDir: string; manifestPath: string; cwd: string },
): Promise<SlideManifestOutput[]> {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const timestamp = compactTimestamp();
  const htmlPath = path.join(options.outputDir, `${deck.id}-${timestamp}.html`);
  fs.writeFileSync(htmlPath, renderDeckHtml(deck, { cwd: options.cwd }), "utf8");
  const outputs: SlideManifestOutput[] = [];
  if (options.formats.includes("html")) outputs.push(outputRecord("html", htmlPath));
  if (options.formats.includes("pptx")) {
    const pptxPath = path.join(options.outputDir, `${deck.id}-${timestamp}.pptx`);
    fs.writeFileSync(pptxPath, buildPptx(deck));
    outputs.push(outputRecord("pptx", pptxPath));
  }
  if (options.formats.includes("pdf") || options.formats.includes("png")) {
    let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null = null;
    try {
      if (process.env.CLAWJS_SLIDES_DISABLE_BROWSER === "1") throw new Error("Browser slide renderer disabled.");
      const playwright = await import("playwright");
      browser = await playwright.chromium.launch({
        headless: true,
        chromiumSandbox: false,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage({ viewport: { width: SLIDE_W, height: SLIDE_H }, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
      if (options.formats.includes("pdf")) {
        const pdfPath = path.join(options.outputDir, `${deck.id}-${timestamp}.pdf`);
        await page.pdf({
          path: pdfPath,
          width: `${SLIDE_W}px`,
          height: `${SLIDE_H}px`,
          printBackground: true,
          margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
        });
        outputs.push(outputRecord("pdf", pdfPath));
      }
      if (options.formats.includes("png")) {
        const pngDir = path.join(options.outputDir, `${deck.id}-${timestamp}-png`);
        fs.mkdirSync(pngDir, { recursive: true });
        const slideCount = await page.locator(".slide").count();
        for (let index = 0; index < slideCount; index += 1) {
          const pngPath = path.join(pngDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
          await page.locator(".slide").nth(index).screenshot({ path: pngPath });
        }
        outputs.push(outputRecord("png", pngDir));
      }
    } catch (error) {
      if (!options.formats.includes("pdf") || outputs.some((output) => output.format === "pdf")) throw error;
      const pdfPath = path.join(options.outputDir, `${deck.id}-${timestamp}.pdf`);
      fs.writeFileSync(pdfPath, buildFallbackPdf(deck));
      outputs.push(outputRecord("pdf", pdfPath, { renderer: "node-fallback" }));
      if (options.formats.includes("png")) throw error;
    } finally {
      await browser?.close();
    }
  }
  return outputs;
}

function renderDeckHtml(deck: SlideDeckManifest, options: { cwd: string }): string {
  const theme = THEME_STYLES[deck.theme] ?? THEME_STYLES.editorial;
  const slides = deck.slides.map((slide, index) => renderSlideHtml(slide, index, theme, options.cwd)).join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(deck.title)}</title>
<style>
@page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #111; }
body { font-family: ${theme.font}; color: ${theme.fg}; }
.deck { width: ${SLIDE_W}px; }
.slide { position: relative; width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; background: ${theme.bg}; color: ${theme.fg}; page-break-after: always; padding: 72px 84px; display: grid; gap: 28px; }
.slide::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 82% 18%, ${hexAlpha(theme.accent, "30")}, transparent 24%), linear-gradient(135deg, transparent 0%, ${hexAlpha(theme.accent2, "13")} 100%); }
.slide > * { position: relative; z-index: 1; }
.eyebrow { font: 700 17px/1 ${theme.mono}; letter-spacing: 0; text-transform: uppercase; color: ${theme.accent}; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 72px; line-height: .94; max-width: 980px; }
h2 { font-size: 54px; line-height: 1; max-width: 980px; }
.subtitle { font-size: 30px; line-height: 1.22; color: ${theme.muted}; max-width: 880px; }
.body { font-size: 30px; line-height: 1.24; color: ${theme.muted}; max-width: 920px; }
.bullets { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; font-size: 30px; line-height: 1.18; }
.bullets li { display: grid; grid-template-columns: 18px 1fr; gap: 18px; align-items: start; }
.bullets li::before { content: ""; width: 10px; height: 10px; border-radius: 999px; background: ${theme.accent}; margin-top: 12px; }
.panel { background: ${hexAlpha(theme.panel, "ee")}; border: 1px solid ${hexAlpha(theme.accent, "35")}; border-radius: 20px; padding: 28px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; align-items: center; height: 100%; }
.image { width: 100%; height: 100%; object-fit: cover; border-radius: 22px; }
.full-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; border-radius: 0; }
.overlay { align-self: end; max-width: 760px; padding: 34px 40px; border-radius: 24px; background: rgba(0,0,0,.62); color: #fff; }
.quote { font-size: 58px; line-height: 1.03; max-width: 980px; }
.attribution { font-size: 24px; color: ${theme.muted}; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.metric-value { font-size: 56px; font-weight: 800; color: ${theme.accent}; line-height: 1; }
.metric-label { font-size: 23px; color: ${theme.fg}; font-weight: 700; }
.metric-detail { font-size: 19px; color: ${theme.muted}; line-height: 1.2; }
.steps { display: grid; gap: 16px; counter-reset: step; }
.step { counter-increment: step; display: grid; grid-template-columns: 56px 1fr; gap: 18px; align-items: center; font-size: 27px; color: ${theme.fg}; }
.step::before { content: counter(step); display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: ${theme.accent}; color: ${theme.bg}; font-weight: 800; }
table { width: 100%; border-collapse: collapse; font-size: 22px; overflow: hidden; border-radius: 18px; }
td, th { padding: 15px 18px; border-bottom: 1px solid ${hexAlpha(theme.muted, "34")}; text-align: left; }
tr:first-child { color: ${theme.accent}; font-weight: 800; background: ${hexAlpha(theme.panel, "cc")}; }
.footer { position: absolute; left: 84px; right: 84px; bottom: 34px; display: flex; justify-content: space-between; font: 16px/1 ${theme.mono}; color: ${theme.muted}; z-index: 2; }
.layout-title, .layout-section, .layout-closing { align-content: center; }
.layout-statement { align-content: center; }
.layout-statement h2 { font-size: 66px; max-width: 1040px; }
.layout-title-bullets { grid-template-rows: auto auto 1fr; }
.layout-full-bleed-image { padding: 58px; align-content: end; background: #000; }
@media print { body { background: transparent; } .slide { break-after: page; } }
</style>
</head>
<body><main class="deck">${slides}</main></body>
</html>`;
}

function renderSlideHtml(slide: SlideManifestSlide, index: number, theme: typeof THEME_STYLES[SlideTheme], cwd: string): string {
  const heading = slide.heading ?? slide.title ?? `Slide ${index + 1}`;
  const subtitle = slide.subtitle ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>` : "";
  const body = slide.body ? `<p class="body">${escapeHtml(slide.body)}</p>` : "";
  const bullets = renderBullets(slide.bullets);
  const image = slide.image?.src ? `<img class="image" src="${escapeAttr(pathToFileURL(resolveInputPath(cwd, slide.image.src)).href)}" alt="${escapeAttr(slide.image.alt ?? "")}">` : `<div class="panel body">Image placeholder</div>`;
  const caption = slide.image?.caption ? `<p class="attribution">${escapeHtml(slide.image.caption)}</p>` : "";
  let content = "";
  switch (slide.layout) {
    case "title":
      content = `<div class="eyebrow">${escapeHtml(slide.metadata?.eyebrow as string || "Presentation")}</div><h1>${escapeHtml(heading)}</h1>${subtitle}`;
      break;
    case "section":
      content = `<div class="eyebrow">${String(index + 1).padStart(2, "0")}</div><h1>${escapeHtml(heading)}</h1>${body || subtitle}`;
      break;
    case "statement":
      content = `<h2>${escapeHtml(heading)}</h2>${subtitle || body}`;
      break;
    case "two-column":
      content = `<h2>${escapeHtml(heading)}</h2><div class="grid2"><div class="panel body">${escapeHtml(slide.left ?? "")}</div><div class="panel body">${escapeHtml(slide.right ?? "")}</div></div>`;
      break;
    case "image-left":
      content = `<div class="grid2">${image}<div><h2>${escapeHtml(heading)}</h2>${subtitle}${body}${bullets}${caption}</div></div>`;
      break;
    case "image-right":
      content = `<div class="grid2"><div><h2>${escapeHtml(heading)}</h2>${subtitle}${body}${bullets}${caption}</div>${image}</div>`;
      break;
    case "full-bleed-image":
      content = slide.image?.src ? `<img class="full-image" src="${escapeAttr(pathToFileURL(resolveInputPath(cwd, slide.image.src)).href)}" alt="${escapeAttr(slide.image.alt ?? "")}"><div class="overlay"><h2>${escapeHtml(heading)}</h2>${subtitle || body}</div>` : `<div class="overlay"><h2>${escapeHtml(heading)}</h2>${subtitle || body}</div>`;
      break;
    case "quote":
      content = `<p class="quote">${escapeHtml(slide.quote ?? heading)}</p>${slide.attribution ? `<p class="attribution">${escapeHtml(slide.attribution)}</p>` : ""}`;
      break;
    case "metric-grid":
      content = `<h2>${escapeHtml(heading)}</h2><div class="metrics">${(slide.metrics ?? []).map((metric) => `<div class="panel"><p class="metric-value">${escapeHtml(metric.value)}</p><p class="metric-label">${escapeHtml(metric.label)}</p>${metric.detail ? `<p class="metric-detail">${escapeHtml(metric.detail)}</p>` : ""}</div>`).join("")}</div>`;
      break;
    case "timeline":
    case "process":
      content = `<h2>${escapeHtml(heading)}</h2><div class="steps">${(slide.steps ?? slide.bullets ?? []).map((step) => `<div class="step">${escapeHtml(step)}</div>`).join("")}</div>`;
      break;
    case "comparison":
      content = `<h2>${escapeHtml(heading)}</h2><div class="grid2"><div class="panel"><div class="eyebrow">Option A</div><p class="body">${escapeHtml(slide.left ?? "")}</p></div><div class="panel"><div class="eyebrow" style="color:${theme.accent2}">Option B</div><p class="body">${escapeHtml(slide.right ?? "")}</p></div></div>`;
      break;
    case "table-lite":
      content = `<h2>${escapeHtml(heading)}</h2>${renderTable(slide.rows ?? [])}`;
      break;
    case "closing":
      content = `<div class="eyebrow">Close</div><h1>${escapeHtml(heading)}</h1>${subtitle || body}`;
      break;
    case "title-bullets":
    default:
      content = `<h2>${escapeHtml(heading)}</h2>${subtitle}${bullets || body}`;
      break;
  }
  return `<section class="slide layout-${slide.layout}" data-slide-id="${escapeAttr(slide.id)}">${content}<div class="footer"><span>${escapeHtml(slide.layout)}</span><span>${index + 1}</span></div></section>`;
}

function renderBullets(items: string[] | undefined): string {
  if (!items?.length) return "";
  return `<ul class="bullets">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  return `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
}

function buildPptx(deck: SlideDeckManifest): Buffer {
  const slideEntries = deck.slides.map((slide, index) => ({
    name: `ppt/slides/slide${index + 1}.xml`,
    data: pptxSlideXml(slide, index, deck),
  }));
  const entries = [
    { name: "[Content_Types].xml", data: contentTypesXml(deck.slides.length) },
    { name: "_rels/.rels", data: rootRelsXml() },
    { name: "docProps/app.xml", data: appPropsXml(deck.slides.length) },
    { name: "docProps/core.xml", data: corePropsXml(deck) },
    { name: "ppt/presentation.xml", data: presentationXml(deck.slides.length) },
    { name: "ppt/_rels/presentation.xml.rels", data: presentationRelsXml(deck.slides.length) },
    { name: "ppt/theme/theme1.xml", data: themeXml(deck.theme) },
    { name: "ppt/slideMasters/slideMaster1.xml", data: slideMasterXml() },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: slideMasterRelsXml() },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: slideLayoutXml() },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: slideLayoutRelsXml() },
    ...slideEntries,
    ...deck.slides.map((_slide, index) => ({ name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: slideRelsXml() })),
  ];
  return zipStore(entries.map((entry) => ({ name: entry.name, data: Buffer.from(entry.data, "utf8") })));
}

function buildFallbackPdf(deck: SlideDeckManifest): Buffer {
  const theme = THEME_STYLES[deck.theme] ?? THEME_STYLES.editorial;
  const objects: string[] = [];
  const pageIds = deck.slides.map((_slide, index) => 4 + index * 2);
  const contentIds = deck.slides.map((_slide, index) => 5 + index * 2);
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${deck.slides.length} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  deck.slides.forEach((slide, index) => {
    const content = fallbackPdfPageContent(slide, index, deck, theme);
    objects[pageIds[index] - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SLIDE_W} ${SLIDE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    objects[contentIds[index] - 1] = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
  });
  return writePdf(objects);
}

function fallbackPdfPageContent(slide: SlideManifestSlide, index: number, deck: SlideDeckManifest, theme: SlideThemeStyle): string {
  const bg = pdfRgb(theme.bg);
  const fg = pdfRgb(theme.fg);
  const muted = pdfRgb(theme.muted);
  const accent = pdfRgb(theme.accent);
  const panel = pdfRgb(theme.panel);
  const lines: string[] = [
    pdfRect(0, 0, SLIDE_W, SLIDE_H, bg),
    pdfRect(84, 78, 112, 4, accent),
  ];
  const heading = slide.heading ?? slide.title ?? deck.title;
  if (["title", "section", "statement", "closing"].includes(slide.layout)) {
    lines.push(...pdfTextLines(slide.layout === "closing" ? "CLOSE" : "PRESENTATION", 84, 470, 13, accent, 36, 18));
    lines.push(...pdfTextLines(heading, 84, 418, 42, fg, 30, 54));
    if (slide.subtitle) lines.push(...pdfTextLines(slide.subtitle, 84, 300, 21, muted, 68, 30));
    if (slide.body) lines.push(...pdfTextLines(slide.body, 84, 250, 18, fg, 78, 26));
  } else if (slide.layout === "comparison") {
    lines.push(...pdfTextLines(heading, 84, 560, 36, fg, 34, 44));
    lines.push(pdfRect(84, 160, 520, 290, panel));
    lines.push(pdfRect(676, 160, 520, 290, panel));
    lines.push(...pdfTextLines("ANTES", 118, 395, 13, muted, 30, 18));
    lines.push(...pdfTextLines(slide.left ?? "", 118, 340, 22, fg, 36, 31));
    lines.push(...pdfTextLines("AHORA", 710, 395, 13, accent, 30, 18));
    lines.push(...pdfTextLines(slide.right ?? "", 710, 340, 22, fg, 36, 31));
  } else if (slide.layout === "metric-grid") {
    lines.push(...pdfTextLines(heading, 84, 560, 36, fg, 34, 44));
    const metrics = (slide.metrics ?? []).slice(0, 6);
    const positions = metrics.map((_metric, metricIndex) => ({
      x: 84 + (metricIndex % 3) * 382,
      y: metricIndex < 3 ? 330 : 160,
    }));
    metrics.forEach((metric, metricIndex) => {
      const position = positions[metricIndex];
      lines.push(pdfRect(position.x, position.y, 330, 118, panel));
      lines.push(...pdfTextLines(metric.value, position.x + 24, position.y + 64, 28, accent, 14, 34));
      lines.push(...pdfTextLines(metric.label, position.x + 24, position.y + 34, 12, muted, 28, 16));
    });
  } else {
    lines.push(...pdfTextLines(heading, 84, 560, 38, fg, 34, 46));
    if (slide.subtitle) lines.push(...pdfTextLines(slide.subtitle, 84, 502, 19, muted, 72, 28));
    let y = slide.subtitle ? 438 : 470;
    const body = fallbackSlideBody(slide);
    for (const entry of body) {
      const color = entry.kind === "metric" ? accent : fg;
      const size = entry.kind === "metric" ? 25 : 20;
      const text = entry.kind === "bullet" ? `- ${entry.text}` : entry.text;
      const wrapped = pdfTextLines(text, 118, y, size, color, entry.kind === "metric" ? 26 : 72, Math.ceil(size * 1.38));
      lines.push(...wrapped);
      y -= Math.max(34, wrapped.length * Math.ceil(size * 1.38) + 14);
      if (y < 112) break;
    }
  }
  lines.push(...pdfTextLines(slide.layout, 64, 28, 10, muted, 40));
  lines.push(...pdfTextLines(String(index + 1), SLIDE_W - 92, 28, 10, muted, 8));
  return lines.join("\n");
}

function fallbackSlideBody(slide: SlideManifestSlide): Array<{ kind: "text" | "bullet" | "metric"; text: string }> {
  const entries: Array<{ kind: "text" | "bullet" | "metric"; text: string }> = [];
  if (slide.body) entries.push({ kind: "text", text: slide.body });
  if (slide.left) entries.push({ kind: "text", text: slide.left });
  if (slide.right) entries.push({ kind: "text", text: slide.right });
  if (slide.quote) entries.push({ kind: "text", text: slide.quote });
  for (const bullet of slide.bullets ?? []) entries.push({ kind: "bullet", text: bullet });
  for (const step of slide.steps ?? []) entries.push({ kind: "bullet", text: step });
  for (const metric of slide.metrics ?? []) entries.push({ kind: "metric", text: `${metric.label}: ${metric.value}${metric.detail ? ` - ${metric.detail}` : ""}` });
  for (const row of slide.rows ?? []) entries.push({ kind: "text", text: row.join(" | ") });
  if (slide.image?.caption) entries.push({ kind: "text", text: slide.image.caption });
  return entries;
}

function pdfRect(x: number, y: number, width: number, height: number, color: string): string {
  return `q ${color} rg ${x} ${y} ${width} ${height} re f Q`;
}

function pdfTextLines(text: string, x: number, y: number, size: number, color: string, width: number, lineHeight = Math.ceil(size * 1.32)): string[] {
  return wrapPdfText(text, width).map((line, index) => `BT /F1 ${size} Tf ${color} rg ${x} ${y - index * lineHeight} Td (${escapePdfText(line)}) Tj ET`);
}

function wrapPdfText(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 8);
}

function pdfRgb(hex: string): string {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function escapePdfText(value: string): string {
  const bytes = Buffer.from(value.replace(/[^\x09\x0a\x0d\x20-\xff]/g, ""), "latin1");
  let output = "";
  for (const byte of bytes) {
    if (byte === 0x5c) output += "\\\\";
    else if (byte === 0x28) output += "\\(";
    else if (byte === 0x29) output += "\\)";
    else if (byte < 0x20 || byte > 0x7e) output += `\\${byte.toString(8).padStart(3, "0")}`;
    else output += String.fromCharCode(byte);
  }
  return output;
}

function writePdf(objects: string[]): Buffer {
  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let offset = Buffer.byteLength(chunks[0], "utf8");
  objects.forEach((object, index) => {
    offsets[index + 1] = offset;
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    offset += Buffer.byteLength(chunk, "utf8");
  });
  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((entry) => `${String(entry).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");
  chunks.push(xref);
  return Buffer.from(chunks.join(""), "utf8");
}

function pptxSlideXml(slide: SlideManifestSlide, index: number, deck: SlideDeckManifest): string {
  const theme = THEME_STYLES[deck.theme] ?? THEME_STYLES.editorial;
  const bg = theme.bg.replace("#", "");
  const heading = slide.heading ?? slide.title ?? `Slide ${index + 1}`;
  const shapes = [
    pptxTextShape(2, heading, 700000, 620000, 10600000, 1150000, 34, theme.fg, true),
    ...(slide.subtitle ? [pptxTextShape(3, slide.subtitle, 720000, 1750000, 9200000, 700000, 18, theme.muted, false)] : []),
    ...pptxContentShapes(slide, theme),
    pptxTextShape(80, `${index + 1}`, 11100000, 6350000, 400000, 220000, 9, theme.muted, false),
  ].join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapes}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function pptxContentShapes(slide: SlideManifestSlide, theme: typeof THEME_STYLES[SlideTheme]): string[] {
  if (slide.layout === "two-column" || slide.layout === "comparison") {
    return [
      pptxTextShape(4, slide.left ?? "", 800000, 2700000, 5000000, 2400000, 20, theme.fg, false),
      pptxTextShape(5, slide.right ?? "", 6400000, 2700000, 5000000, 2400000, 20, theme.fg, false),
    ];
  }
  if (slide.layout === "quote") {
    return [pptxTextShape(4, slide.quote ?? "", 900000, 2000000, 10000000, 2500000, 31, theme.fg, false)];
  }
  if (slide.layout === "metric-grid") {
    return (slide.metrics ?? []).slice(0, 6).map((metric, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return pptxTextShape(4 + index, `${metric.value}\n${metric.label}${metric.detail ? `\n${metric.detail}` : ""}`, 780000 + col * 3600000, 2400000 + row * 1450000, 3100000, 1050000, 18, theme.fg, false);
    });
  }
  if (slide.layout === "table-lite") {
    return [pptxTextShape(4, (slide.rows ?? []).map((row) => row.join("    ")).join("\n"), 800000, 2150000, 10400000, 3300000, 16, theme.fg, false)];
  }
  const bodyText = [
    slide.body,
    ...(slide.bullets ?? []).map((bullet) => `• ${bullet}`),
    ...(slide.steps ?? []).map((step, index) => `${index + 1}. ${step}`),
    slide.image?.caption,
  ].filter(Boolean).join("\n");
  return bodyText ? [pptxTextShape(4, bodyText, 850000, 2350000, 9800000, 3200000, 20, theme.fg, false)] : [];
}

function pptxTextShape(id: number, value: string, x: number, y: number, cx: number, cy: number, fontSize: number, color: string, bold: boolean): string {
  const runs = value.split(/\r?\n/).map((line) => `<a:p><a:r><a:rPr lang="en-US" sz="${fontSize * 100}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color.replace("#", "")}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`).join("");
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
  <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${runs || "<a:p/>"}</p:txBody>
</p:sp>`;
}

function contentTypesXml(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${Array.from({ length: slideCount }, (_value, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function presentationXml(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${Array.from({ length: slideCount }, (_value, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("")}</p:sldIdLst>
<p:sldSz cx="${PPTX_W}" cy="${PPTX_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`;
}

function presentationRelsXml(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${Array.from({ length: slideCount }, (_value, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("")}</Relationships>`;
}

function slideMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function slideMasterRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
}

function slideLayoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function slideLayoutRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
}

function slideRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
}

function appPropsXml(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ClawJS</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides></Properties>`;
}

function corePropsXml(deck: SlideDeckManifest): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(deck.title)}</dc:title><dc:creator>${escapeXml(deck.author.name ?? deck.author.agentId ?? "ClawJS")}</dc:creator><cp:lastModifiedBy>ClawJS</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${deck.createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${deck.updatedAt}</dcterms:modified></cp:coreProperties>`;
}

function themeXml(themeId: SlideTheme): string {
  const theme = THEME_STYLES[themeId] ?? THEME_STYLES.editorial;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ClawJS"><a:themeElements><a:clrScheme name="ClawJS"><a:dk1><a:srgbClr val="${theme.fg.replace("#", "")}"/></a:dk1><a:lt1><a:srgbClr val="${theme.bg.replace("#", "")}"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2><a:accent1><a:srgbClr val="${theme.accent.replace("#", "")}"/></a:accent1><a:accent2><a:srgbClr val="${theme.accent2.replace("#", "")}"/></a:accent2><a:accent3><a:srgbClr val="57C7FF"/></a:accent3><a:accent4><a:srgbClr val="59D98E"/></a:accent4><a:accent5><a:srgbClr val="FFD166"/></a:accent5><a:accent6><a:srgbClr val="A78BFA"/></a:accent6><a:hlink><a:srgbClr val="${theme.accent.replace("#", "")}"/></a:hlink><a:folHlink><a:srgbClr val="${theme.accent2.replace("#", "")}"/></a:folHlink></a:clrScheme><a:fontScheme name="ClawJS"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="ClawJS"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

function zipStore(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, end]);
}

let crcTable: number[] | null = null;
function crc32(buffer: Buffer): number {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_value, index) => {
      let c = index;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildSlideFromFlags(layout: SlideLayout, argv: string[], flags: Record<string, string>): SlideManifestSlide {
  return {
    id: flags.id || `slide-${randomBytes(4).toString("hex")}`,
    layout,
    ...(flags.title ? { title: flags.title } : {}),
    ...(flags.heading ? { heading: flags.heading } : {}),
    ...(flags.subtitle ? { subtitle: flags.subtitle } : {}),
    ...(flags.body ? { body: flags.body } : {}),
    ...(flags.left ? { left: flags.left } : {}),
    ...(flags.right ? { right: flags.right } : {}),
    ...(flags.quote ? { quote: flags.quote } : {}),
    ...(flags.attribution ? { attribution: flags.attribution } : {}),
    ...(readListFlag(argv, flags, "bullet", "bullets").length ? { bullets: readListFlag(argv, flags, "bullet", "bullets") } : {}),
    ...(readListFlag(argv, flags, "step", "steps").length ? { steps: readListFlag(argv, flags, "step", "steps") } : {}),
    ...(parseMetrics(flags.metrics || flags.metric).length ? { metrics: parseMetrics(flags.metrics || flags.metric) } : {}),
    ...(parseRows(flags["rows-json"] || flags.rows).length ? { rows: parseRows(flags["rows-json"] || flags.rows) } : {}),
    ...(flags.image || flags["image-src"] ? { image: { src: flags.image || flags["image-src"], ...(flags.alt ? { alt: flags.alt } : {}), ...(flags.caption ? { caption: flags.caption } : {}) } } : {}),
    ...(flags.notes ? { notes: flags.notes } : {}),
    ...(parseObjectFlag(flags["metadata-json"]) ? { metadata: parseObjectFlag(flags["metadata-json"]) } : {}),
  };
}

function writeOutput(options: SlidesCliOptions, payload: unknown, text: string): void {
  if (options.wantsJson) {
    options.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    options.context.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }
}

function deckManifestPath(workspaceRoot: string, deckId: string): string {
  return path.join(workspaceRoot, ".clawjs", "slides", "decks", `${deckId}.json`);
}

function deckOutputDir(workspaceRoot: string, deckId: string): string {
  return path.join(workspaceRoot, ".clawjs", "slides", "outputs", deckId);
}

function writeDeck(filePath: string, deck: SlideDeckManifest): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
}

function readDeckByRef(workspaceRoot: string, cwd: string, ref: string): { path: string; deck: SlideDeckManifest } {
  const candidates = [
    path.resolve(cwd, ref),
    deckManifestPath(workspaceRoot, ref),
    path.resolve(workspaceRoot, ref),
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) throw new Error(`Slide deck not found: ${ref}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as SlideDeckManifest;
  return { path: filePath, deck: normalizeDeck(parsed) };
}

function normalizeDeck(deck: SlideDeckManifest): SlideDeckManifest {
  return {
    schemaVersion: 1,
    id: deck.id || `deck-${randomBytes(3).toString("hex")}`,
    title: deck.title || "Untitled deck",
    theme: parseTheme(deck.theme) ?? "editorial",
    author: deck.author ?? {},
    slides: (deck.slides ?? []).map((slide, index) => ({
      ...slide,
      id: slide.id || `slide-${index + 1}`,
      layout: parseLayout(slide.layout) ?? "title-bullets",
    })),
    metadata: deck.metadata ?? {},
    outputs: deck.outputs ?? [],
    createdAt: deck.createdAt || nowIso(),
    updatedAt: deck.updatedAt || nowIso(),
  };
}

function parseLayout(value: string | undefined): SlideLayout | null {
  return SLIDE_LAYOUTS.includes(value as SlideLayout) ? value as SlideLayout : null;
}

function parseTheme(value: string | undefined): SlideTheme | null {
  return SLIDE_THEMES.includes(value as SlideTheme) ? value as SlideTheme : null;
}

function parseFormats(value: string): SlideRenderFormat[] {
  const formats = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const parsed = formats.map((format) => {
    if (!["pdf", "pptx", "html", "png"].includes(format)) throw new Error(`Unsupported slide render format: ${format}`);
    return format as SlideRenderFormat;
  });
  return Array.from(new Set(parsed.length ? parsed : ["pdf"]));
}

function parseObjectFlag(value: string | undefined): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected JSON object.");
  return parsed as Record<string, unknown>;
}

function readListFlag(argv: string[], flags: Record<string, string>, singular: string, plural: string): string[] {
  const values: string[] = [];
  let explicitSingularCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== `--${singular}`) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      explicitSingularCount += 1;
      values.push(next);
    }
  }
  const combined = [flags[plural], explicitSingularCount === 0 ? flags[singular] : undefined].filter(Boolean).join("|");
  if (combined) values.push(...combined.split(/[|;]/));
  return values.map((entry) => entry.trim()).filter(Boolean);
}

function parseMetrics(value: string | undefined): SlideMetric[] {
  if (!value?.trim()) return [];
  if (value.trim().startsWith("[")) return JSON.parse(value) as SlideMetric[];
  return value.split(",").map((entry) => {
    const [label, metricValue, detail] = entry.split("=");
    return { label: label?.trim() || "Metric", value: metricValue?.trim() || "", ...(detail?.trim() ? { detail: detail.trim() } : {}) };
  }).filter((entry) => entry.value);
}

function parseRows(value: string | undefined): string[][] {
  if (!value?.trim()) return [];
  if (value.trim().startsWith("[")) return JSON.parse(value) as string[][];
  return value.split(";").map((row) => row.split("|").map((cell) => cell.trim()));
}

function parseDurationMs(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(\d+)(m|h|d)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (match[2] === "m") return amount * 60 * 1000;
  if (match[2] === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function joinedPositionals(positionals: string[], startIndex: number): string | undefined {
  const value = positionals.slice(startIndex).join(" ").trim();
  return value || undefined;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "deck";
}

function nowIso(): string {
  return new Date().toISOString();
}

function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function issue(slide: SlideManifestSlide, index: number, field: string, severity: SlideSeverity, message: string, count?: number, min?: number, max?: number): SlideValidationIssue {
  return {
    slideId: slide.id,
    slideIndex: index,
    field,
    severity,
    message,
    ...(count !== undefined ? { count } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  };
}

function layoutBudgets(layout: SlideLayout): Record<string, unknown> {
  return {
    heading: FIELD_BUDGETS.heading,
    subtitle: FIELD_BUDGETS.subtitle,
    bullet: FIELD_BUDGETS.bullet,
    body: FIELD_BUDGETS.body,
    maxBullets: maxBulletsForLayout(layout),
  };
}

function maxBulletsForLayout(layout: SlideLayout): number {
  if (["title", "section", "statement", "quote", "closing", "full-bleed-image"].includes(layout)) return 0;
  if (["image-left", "image-right"].includes(layout)) return 4;
  return 6;
}

function newestOutput(deck: SlideDeckManifest, format: SlideRenderFormat): SlideManifestOutput | undefined {
  return deck.outputs.find((output) => output.format === format);
}

function outputRecord(format: SlideRenderFormat, filePath: string, metadata?: Record<string, unknown>): SlideManifestOutput {
  return {
    format,
    path: filePath,
    createdAt: nowIso(),
    sizeBytes: fs.statSync(filePath).isDirectory()
      ? directorySize(filePath)
      : fs.statSync(filePath).size,
    ...(metadata ? { metadata } : {}),
  };
}

function directorySize(dir: string): number {
  return fs.readdirSync(dir).reduce((total, entry) => {
    const filePath = path.join(dir, entry);
    const stat = fs.statSync(filePath);
    return total + (stat.isDirectory() ? directorySize(filePath) : stat.size);
  }, 0);
}

function mimeTypeForFormat(format: SlideRenderFormat): string {
  switch (format) {
    case "pdf":
      return "application/pdf";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "html":
      return "text/html";
    case "png":
      return "image/png";
  }
}

function firstPngInDir(dir: string): string | null {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const entry = fs.readdirSync(dir).find((candidate) => candidate.toLowerCase().endsWith(".png"));
  return entry ? path.join(dir, entry) : null;
}

function formatValidationReport(report: SlideValidationReport): string {
  if (report.issues.length === 0) return "ok";
  return report.issues.map((entry) => {
    const slide = entry.slideIndex !== undefined ? `slide ${entry.slideIndex + 1}` : "deck";
    const count = entry.count !== undefined ? ` (${entry.count}${entry.max ? `/${entry.max}` : ""})` : "";
    return `${entry.severity.toUpperCase()} ${slide} ${entry.field}: ${entry.message}${count}`;
  }).join("\n");
}

function resolveInputPath(cwd: string, value: string): string {
  if (value.startsWith("file://")) return new URL(value).pathname;
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function readImageDimensions(filePath: string): { width: number; height: number } | null {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeXml(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function hexAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

// Keep os referenced so tsup preserves Node stdlib polyfill expectations for older bundle checks.
void os.platform;
