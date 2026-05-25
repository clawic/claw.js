import fs from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { pathToFileURL } from "url";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { scheduleSlidesDeckSearchEvent } from "./cli-search-events.ts";
const SLIDE_LAYOUTS = [
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

const SLIDE_THEMES = [
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

type SlideLayout = typeof SLIDE_LAYOUTS[number];
type SlideTheme = typeof SLIDE_THEMES[number];
type SlideSeverity = "green" | "yellow" | "orange" | "red";
type SlideRenderFormat = "pdf" | "pptx" | "html" | "png";

interface SlideMetric {
  label: string;
  value: string;
  detail?: string;
}

interface SlideImageRef {
  src: string;
  alt?: string;
  caption?: string;
}

interface SlideManifestSlide {
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

interface SlideManifestOutput {
  format: SlideRenderFormat;
  path: string;
  mediaId?: string;
  createdAt: string;
  sizeBytes: number;
}

interface SlideDeckManifest {
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

interface SlideValidationIssue {
  slideId?: string;
  slideIndex?: number;
  field: string;
  severity: SlideSeverity;
  message: string;
  count?: number;
  min?: number;
  max?: number;
}

interface SlideValidationReport {
  ok: boolean;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: SlideValidationIssue[];
}

interface SlidesCliContext {
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
  createMediaShare?: (input: { mediaId?: string; label?: string; legalLabel?: string; approvalId?: string; ttlMs?: number; expiresAt?: string | null; filters?: { query?: string; kind?: "document" | "image"; workspaceId?: string; agentId?: string } }) => Promise<{ id: string; url: string }>;
}

const SLIDES_OK = 0;
const SLIDES_FAILURE = 1;
const SLIDES_USAGE = 64;
const SLIDE_W = 1280;
const SLIDE_H = 720;
const PPTX_W = 12192000;
const PPTX_H = 6858000;
const SAFE_DECK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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
    scheduleSlideDeckSearchRefresh(options, deck.id);
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
    scheduleSlideDeckSearchRefresh(options, resolved.deck.id);
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
  if (command === "delete") {
    if (!target) {
      context.stderr.write(`Usage: ${context.binName} slides delete <deck>\n`);
      return SLIDES_USAGE;
    }
    const resolved = readDeckByRef(options.workspaceRoot, context.cwd, target);
    fs.rmSync(resolved.path, { force: true });
    scheduleSlideDeckSearchDelete(options, resolved.deck.id);
    writeOutput(options, { id: resolved.deck.id, deleted: true, path: resolved.path }, resolved.deck.id);
    return SLIDES_OK;
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
    scheduleSlideDeckSearchRefresh(options, resolved.deck.id);
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
      scheduleSlideDeckSearchRefresh(options, resolved.deck.id);
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
      scheduleSlideDeckSearchRefresh(options, resolved.deck.id);
    }
    if (!output.mediaId) {
      context.stderr.write("Unable to register slide output for sharing.\n");
      return SLIDES_FAILURE;
    }
    const shareInput = {
      label: flags.label || `${resolved.deck.title} ${format.toUpperCase()}`,
      legalLabel: flags["legal-label"],
      approvalId: flags["approval-id"] ?? flags["host-approval-id"],
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

  context.stderr.write(`Usage: ${context.binName} slides create|add|validate|delete|render|share|themes|layouts\n`);
  return SLIDES_USAGE;
}

function createDeckManifest(input: {
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

function validateSlideDeck(deck: SlideDeckManifest, options: { cwd: string }): SlideValidationReport {
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
  if (isExternalImageSrc(slide.image.src)) return;
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
      if (process.env.CLAW_SLIDES_DISABLE_BROWSER === "1") throw new Error("Browser slide renderer disabled.");
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
.slide { position: relative; width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; background: ${theme.bg}; color: ${theme.fg}; page-break-after: always; padding: 56px 72px; display: grid; gap: 24px; }
.slide::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 86% 16%, ${hexAlpha(theme.accent, "24")}, transparent 23%), linear-gradient(135deg, transparent 0%, ${hexAlpha(theme.accent2, "14")} 100%); }
.slide::after { content: ""; position: absolute; right: -130px; bottom: -190px; width: 430px; height: 430px; border: 62px solid ${hexAlpha(theme.accent, "22")}; border-radius: 999px; pointer-events: none; }
.slide > * { position: relative; z-index: 1; }
.eyebrow { font: 700 17px/1 ${theme.mono}; letter-spacing: 0; text-transform: uppercase; color: ${theme.accent}; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 78px; line-height: .92; max-width: 980px; }
h2 { font-size: 58px; line-height: .96; max-width: 1040px; }
.subtitle { font-size: 32px; line-height: 1.18; color: ${theme.muted}; max-width: 880px; white-space: pre-line; }
.body { font-size: 32px; line-height: 1.2; color: ${theme.muted}; max-width: 920px; white-space: pre-line; }
.bullets { counter-reset: bullet; display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; font-size: 27px; line-height: 1.14; }
.bullets li { counter-increment: bullet; display: grid; grid-template-columns: 54px 1fr; gap: 18px; align-items: center; min-height: 74px; padding: 16px 22px 16px 16px; border-radius: 18px; background: ${hexAlpha(theme.panel, "dd")}; border: 1px solid ${hexAlpha(theme.accent, "24")}; box-shadow: 0 18px 45px ${hexAlpha("#000000", "08")}; white-space: pre-line; }
.bullets li::before { content: counter(bullet); display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: ${theme.accent}; color: ${theme.bg}; font: 800 21px/1 ${theme.font}; }
.panel { background: ${hexAlpha(theme.panel, "f2")}; border: 1px solid ${hexAlpha(theme.accent, "28")}; border-radius: 14px; padding: 34px; box-shadow: 0 20px 54px ${hexAlpha("#000000", "09")}; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; align-items: stretch; height: 100%; }
.image { width: 100%; height: 100%; object-fit: cover; border-radius: 18px; box-shadow: 0 26px 70px ${hexAlpha("#000000", "18")}; }
.full-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; border-radius: 0; }
.full-image-scrim { position: absolute; inset: 0; z-index: 1; background: linear-gradient(90deg, rgba(0,0,0,.74), rgba(0,0,0,.34) 48%, rgba(0,0,0,.08)); }
.overlay { align-self: end; max-width: 760px; padding: 34px 40px; border-radius: 18px; background: rgba(0,0,0,.66); color: #fff; }
.overlay .subtitle, .overlay .body { color: rgba(255,255,255,.82); }
.quote { font-size: 58px; line-height: 1.03; max-width: 980px; }
.quote-mark { font: 800 150px/.75 ${theme.font}; color: ${hexAlpha(theme.accent, "32")}; height: 82px; }
.attribution { font-size: 24px; color: ${theme.muted}; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; align-self: center; }
.metric-value { font-size: 60px; font-weight: 800; color: ${theme.accent}; line-height: .95; }
.metric-label { font-size: 23px; color: ${theme.fg}; font-weight: 700; }
.metric-detail { font-size: 19px; color: ${theme.muted}; line-height: 1.2; white-space: pre-line; }
.steps { display: grid; gap: 18px; counter-reset: step; align-self: center; }
.step { counter-increment: step; display: grid; gap: 22px; align-content: start; min-height: 184px; padding: 26px; border-radius: 14px; background: ${hexAlpha(theme.panel, "f0")}; border: 1px solid ${hexAlpha(theme.accent, "24")}; box-shadow: 0 18px 48px ${hexAlpha("#000000", "07")}; font-size: 27px; line-height: 1.14; color: ${theme.fg}; white-space: pre-line; }
.step::before { content: counter(step); display: grid; place-items: center; width: 52px; height: 52px; border-radius: 15px; background: ${theme.accent}; color: ${theme.bg}; font-weight: 800; }
table { width: 100%; border-collapse: collapse; font-size: 22px; overflow: hidden; border-radius: 18px; }
td, th { padding: 15px 18px; border-bottom: 1px solid ${hexAlpha(theme.muted, "34")}; text-align: left; }
tr:first-child { color: ${theme.accent}; font-weight: 800; background: ${hexAlpha(theme.panel, "cc")}; }
.footer { position: absolute; left: 84px; right: 84px; bottom: 34px; display: flex; justify-content: space-between; font: 16px/1 ${theme.mono}; color: ${theme.muted}; z-index: 2; }
.layout-title, .layout-section, .layout-closing { align-content: center; padding-left: 84px; }
.layout-title h1, .layout-section h1, .layout-closing h1 { max-width: 760px; }
.layout-title .subtitle, .layout-section .subtitle, .layout-closing .subtitle { margin-top: 4px; max-width: 720px; }
.layout-statement { align-content: center; }
.layout-statement h2 { font-size: 66px; max-width: 1040px; }
.layout-title-bullets { grid-template-rows: auto auto; align-content: center; gap: 26px; }
.layout-title-bullets h2 { margin-bottom: 8px; }
.layout-two-column { grid-template-rows: auto 1fr; }
.layout-two-column .panel { display: grid; align-content: center; min-height: 318px; }
.layout-two-column .body { color: ${theme.fg}; font-size: 34px; line-height: 1.16; }
.layout-comparison { grid-template-rows: auto 1fr; }
.layout-comparison .panel { display: grid; align-content: center; min-height: 312px; }
.layout-comparison .body { color: ${theme.fg}; font-size: 34px; line-height: 1.15; }
.layout-metric-grid { grid-template-rows: auto 1fr; }
.layout-metric-grid .panel { min-height: 196px; display: grid; align-content: center; }
.layout-timeline, .layout-process { grid-template-rows: auto 1fr; }
.layout-timeline .steps { grid-template-columns: repeat(3, 1fr); }
.layout-process .steps { grid-template-columns: repeat(4, 1fr); }
.layout-quote { align-content: center; gap: 14px; }
.layout-quote .quote { font-size: 68px; line-height: 1.02; max-width: 980px; }
.layout-quote .attribution { margin-top: 16px; font-size: 28px; }
.layout-image-left, .layout-image-right { padding: 46px 58px; }
.layout-image-left .grid2, .layout-image-right .grid2 { gap: 42px; grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr); align-items: center; }
.layout-image-right .grid2 { grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); }
.image-copy { display: grid; align-content: center; gap: 24px; min-width: 0; }
.image-copy .bullets { gap: 12px; font-size: 23px; }
.image-copy .bullets li { min-height: 64px; padding: 13px 18px 13px 14px; }
.image-copy .subtitle, .image-copy .body { font-size: 27px; max-width: 520px; }
.image-copy h2 { font-size: 52px; max-width: 540px; }
.layout-full-bleed-image { padding: 64px 72px; align-content: end; background: #000; }
.layout-full-bleed-image::before, .layout-full-bleed-image::after { display: none; }
.layout-full-bleed-image .overlay { z-index: 2; }
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
  const image = slide.image?.src ? `<img class="image" src="${escapeAttr(imageSrcForHtml(cwd, slide.image.src))}" alt="${escapeAttr(slide.image.alt ?? "")}">` : `<div class="panel body">Image placeholder</div>`;
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
      content = `<div class="grid2">${image}<div class="image-copy"><h2>${escapeHtml(heading)}</h2>${subtitle}${body}${bullets}${caption}</div></div>`;
      break;
    case "image-right":
      content = `<div class="grid2"><div class="image-copy"><h2>${escapeHtml(heading)}</h2>${subtitle}${body}${bullets}${caption}</div>${image}</div>`;
      break;
    case "full-bleed-image":
      content = slide.image?.src ? `<img class="full-image" src="${escapeAttr(imageSrcForHtml(cwd, slide.image.src))}" alt="${escapeAttr(slide.image.alt ?? "")}"><div class="full-image-scrim"></div><div class="overlay"><h2>${escapeHtml(heading)}</h2>${subtitle || body}</div>` : `<div class="overlay"><h2>${escapeHtml(heading)}</h2>${subtitle || body}</div>`;
      break;
    case "quote":
      content = `<div class="quote-mark">"</div><p class="quote">${escapeHtml(slide.quote ?? heading)}</p>${slide.attribution ? `<p class="attribution">${escapeHtml(slide.attribution)}</p>` : ""}`;
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
  const accent2 = pdfRgb(theme.accent2);
  const panel = pdfRgb(theme.panel);
  const lines: string[] = [
    pdfRect(0, 0, SLIDE_W, SLIDE_H, bg),
    pdfRect(0, 0, 18, SLIDE_H, accent),
    pdfRect(84, 78, 146, 6, accent),
  ];
  const heading = slide.heading ?? slide.title ?? deck.title;
  if (["title", "section", "statement", "closing"].includes(slide.layout)) {
    lines.push(pdfRect(84, 350, 88, 4, accent2));
    lines.push(...pdfTextLines(slide.layout === "closing" ? "CLOSE" : "PRESENTATION", 84, 492, 13, accent, 36, 18));
    lines.push(...pdfTextLines(heading, 84, 438, 50, fg, 27, 60));
    if (slide.subtitle) lines.push(...pdfTextLines(slide.subtitle, 84, 282, 23, muted, 64, 32));
    if (slide.body) lines.push(...pdfTextLines(slide.body, 84, 230, 19, fg, 76, 27));
  } else if (["image-left", "image-right", "full-bleed-image"].includes(slide.layout)) {
    const full = slide.layout === "full-bleed-image";
    lines.push(pdfRect(0, 0, SLIDE_W, SLIDE_H, full ? pdfRgb("#07111f") : bg));
    if (full) {
      lines.push(pdfRect(0, 0, SLIDE_W, SLIDE_H, pdfRgb("#07111f")));
      lines.push(pdfRect(690, 0, 590, SLIDE_H, accent));
      lines.push(pdfRect(760, 88, 420, 520, accent2));
      lines.push(pdfRect(812, 136, 316, 424, panel));
      lines.push(...pdfTextLines(heading, 84, 442, 46, "1.000 1.000 1.000", 26, 56));
      if (slide.subtitle) lines.push(...pdfTextLines(slide.subtitle, 84, 284, 22, "0.820 0.870 0.920", 58, 31));
      if (slide.body) lines.push(...pdfTextLines(slide.body, 84, 238, 20, "0.820 0.870 0.920", 64, 29));
    } else {
      const imageOnLeft = slide.layout === "image-left";
      const imageX = imageOnLeft ? 84 : 704;
      const copyX = imageOnLeft ? 704 : 84;
      lines.push(pdfRect(imageX, 98, 492, 524, panel));
      lines.push(pdfRect(imageX + 24, 122, 444, 476, accent));
      lines.push(pdfRect(imageX + 64, 166, 364, 388, accent2));
      lines.push(pdfRect(imageX + 108, 218, 276, 286, bg));
      lines.push(...pdfTextLines(slide.image?.caption ?? "Visual", imageX + 48, 148, 15, fg, 34, 20));
      lines.push(...pdfTextLines(heading, copyX, 496, 39, fg, 25, 48));
      if (slide.subtitle) lines.push(...pdfTextLines(slide.subtitle, copyX, 380, 21, muted, 40, 30));
      if (slide.body) lines.push(...pdfTextLines(slide.body, copyX, 334, 20, fg, 42, 29));
      let y = slide.body || slide.subtitle ? 244 : 344;
      for (const [entryIndex, bullet] of (slide.bullets ?? []).slice(0, 3).entries()) {
        lines.push(pdfRoundedMarker(copyX, y - 14, String(entryIndex + 1), entryIndex % 2 === 0 ? accent : accent2, bg));
        lines.push(...pdfTextLines(bullet, copyX + 62, y, 18, fg, 38, 25));
        y -= 68;
      }
    }
  } else if (slide.layout === "comparison") {
    lines.push(...pdfTextLines(heading, 84, 578, 39, fg, 34, 46));
    lines.push(pdfRect(84, 126, 520, 330, panel));
    lines.push(pdfRect(676, 126, 520, 330, panel));
    lines.push(pdfRect(84, 126, 8, 330, muted));
    lines.push(pdfRect(676, 126, 8, 330, accent));
    lines.push(...pdfTextLines("ANTES", 124, 392, 13, muted, 30, 18));
    lines.push(...pdfTextLines(slide.left ?? "", 124, 334, 22, fg, 35, 31));
    lines.push(...pdfTextLines("AHORA", 716, 392, 13, accent, 30, 18));
    lines.push(...pdfTextLines(slide.right ?? "", 716, 334, 22, fg, 35, 31));
  } else if (slide.layout === "metric-grid") {
    lines.push(...pdfTextLines(heading, 84, 578, 39, fg, 34, 46));
    const metrics = (slide.metrics ?? []).slice(0, 6);
    const positions = metrics.map((_metric, metricIndex) => ({
      x: 84 + (metricIndex % 3) * 382,
      y: metricIndex < 3 ? 326 : 142,
    }));
    metrics.forEach((metric, metricIndex) => {
      const position = positions[metricIndex];
      lines.push(pdfRect(position.x, position.y, 338, 142, panel));
      lines.push(pdfRect(position.x, position.y + 136, 338, 6, metricIndex % 2 === 0 ? accent : accent2));
      lines.push(...pdfTextLines(metric.value, position.x + 28, position.y + 90, 25, accent, 18, 30));
      lines.push(...pdfTextLines(metric.label, position.x + 28, position.y + 30, 13, muted, 28, 17));
      if (metric.detail) lines.push(...pdfTextLines(metric.detail, position.x + 28, position.y + 12, 10, muted, 34, 14));
    });
  } else {
    lines.push(...pdfTextLines(heading, 84, 578, 40, fg, 34, 48));
    if (slide.subtitle) lines.push(...pdfTextLines(slide.subtitle, 84, 514, 20, muted, 72, 29));
    let y = slide.subtitle ? 430 : 468;
    const body = fallbackSlideBody(slide);
    for (let entryIndex = 0; entryIndex < body.length; entryIndex += 1) {
      const entry = body[entryIndex];
      const color = entry.kind === "metric" ? accent : fg;
      const size = entry.kind === "metric" ? 25 : 20;
      if (entry.kind === "bullet") {
        const wrapped = pdfTextLines(entry.text, 220, y - 4, size, color, 62, Math.ceil(size * 1.28));
        const height = Math.max(68, wrapped.length * Math.ceil(size * 1.28) + 26);
        lines.push(pdfRect(118, y - height + 22, 994, height, panel));
        lines.push(pdfRect(118, y - height + 22, 7, height, entryIndex % 2 === 0 ? accent : accent2));
        lines.push(pdfRoundedMarker(148, y - 16, String(entryIndex + 1), entryIndex % 2 === 0 ? accent : accent2, bg));
        lines.push(...wrapped);
        y -= height + 14;
      } else {
        const wrapped = pdfTextLines(entry.text, 118, y, size, color, entry.kind === "metric" ? 26 : 72, Math.ceil(size * 1.38));
        lines.push(...wrapped);
        y -= Math.max(34, wrapped.length * Math.ceil(size * 1.38) + 14);
      }
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

function pdfRoundedMarker(x: number, y: number, label: string, color: string, textColor: string): string {
  return [
    pdfRect(x, y, 42, 42, color),
    ...pdfTextLines(label, x + 15, y + 12, 16, textColor, 3, 18),
  ].join("\n");
}

function pdfTextLines(text: string, x: number, y: number, size: number, color: string, width: number, lineHeight = Math.ceil(size * 1.32)): string[] {
  return wrapPdfText(text, width).map((line, index) => `BT /F1 ${size} Tf ${color} rg ${x} ${y - index * lineHeight} Td (${escapePdfText(line)}) Tj ET`);
}

function wrapPdfText(text: string, width: number): string[] {
  const lines: string[] = [];
  const paragraphs = normalizeSlideText(text).split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.replace(/[ \t]+/g, " ").trim().split(" ").filter(Boolean);
    if (words.length === 0) {
      if (lines.length) lines.push("");
      continue;
    }
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
  }
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
  const bullets = readListFlag(argv, flags, "bullet", "bullets").map(normalizeSlideText);
  const steps = readListFlag(argv, flags, "step", "steps").map(normalizeSlideText);
  const metrics = parseMetricFlags(argv, flags).map((metric) => ({
    label: normalizeSlideText(metric.label),
    value: normalizeSlideText(metric.value),
    ...(metric.detail ? { detail: normalizeSlideText(metric.detail) } : {}),
  }));
  const rows = parseRowsFlag(flags).map((row) => row.map(normalizeSlideText));
  const metadata = parseObjectFlag(flags["metadata-json"]);
  return {
    id: flags.id || `slide-${randomBytes(4).toString("hex")}`,
    layout,
    ...(flags.title ? { title: normalizeSlideText(flags.title) } : {}),
    ...(flags.heading ? { heading: normalizeSlideText(flags.heading) } : {}),
    ...(flags.subtitle ? { subtitle: normalizeSlideText(flags.subtitle) } : {}),
    ...(flags.body ? { body: normalizeSlideText(flags.body) } : {}),
    ...(flags.left ? { left: normalizeSlideText(flags.left) } : {}),
    ...(flags.right ? { right: normalizeSlideText(flags.right) } : {}),
    ...(flags.quote ? { quote: normalizeSlideText(flags.quote) } : {}),
    ...(flags.attribution ? { attribution: normalizeSlideText(flags.attribution) } : {}),
    ...(bullets.length ? { bullets } : {}),
    ...(steps.length ? { steps } : {}),
    ...(metrics.length ? { metrics } : {}),
    ...(rows.length ? { rows } : {}),
    ...(flags.image || flags["image-src"] ? { image: { src: flags.image || flags["image-src"], ...(flags.alt ? { alt: normalizeSlideText(flags.alt) } : {}), ...(flags.caption ? { caption: normalizeSlideText(flags.caption) } : {}) } } : {}),
    ...(flags.notes ? { notes: normalizeSlideText(flags.notes) } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeSlideText(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\t/g, "\t").trim();
}

function writeOutput(options: SlidesCliOptions, payload: unknown, text: string): void {
  if (options.wantsJson) {
    options.context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    options.context.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }
}

function deckManifestPath(workspaceRoot: string, deckId: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.slides", workspaceRoot, "decks", `${deckId}.json`);
}

function deckOutputDir(workspaceRoot: string, deckId: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.slides", workspaceRoot, "outputs", deckId);
}

function writeDeck(filePath: string, deck: SlideDeckManifest): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
}

function scheduleSlideDeckSearchRefresh(options: SlidesCliOptions, deckId: string): void {
  scheduleSlidesDeckSearchEvent({
    operation: "upsert",
    deckId,
    workspaceRoot: options.workspaceRoot,
    dataDir: searchEventDataDir(options.workspaceRoot, options.flags),
    flags: options.flags,
  });
}

function scheduleSlideDeckSearchDelete(options: SlidesCliOptions, deckId: string): void {
  scheduleSlidesDeckSearchEvent({
    operation: "delete",
    deckId,
    workspaceRoot: options.workspaceRoot,
    dataDir: searchEventDataDir(options.workspaceRoot, options.flags),
    flags: options.flags,
  });
}

function searchEventDataDir(workspaceRoot: string, flags: Record<string, string>): string {
  return flags["data-dir"] ? path.resolve(flags["data-dir"]) : resolveClawPersistentSurfacePath("claw.workspace.data", workspaceRoot);
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
    id: normalizeDeckId(deck.id),
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

function normalizeDeckId(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    return `deck-${randomBytes(3).toString("hex")}`;
  }
  const id = value.trim();
  if (!SAFE_DECK_ID_PATTERN.test(id) || id === "." || id === "..") {
    throw new CliHandledError(
      "invalid_slide_deck_id",
      "Slide deck id must be a safe local identifier, not a path.",
      CLI_EXIT_USAGE,
      { details: { field: "id" } },
    );
  }
  return id;
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
  const parsed = parseJsonFlag(value, "invalid_slides_metadata_json", "--metadata-json must be a JSON object.");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliHandledError("invalid_slides_metadata_json", "--metadata-json must be a JSON object.", CLI_EXIT_USAGE);
  }
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
  if (value.trim().startsWith("[")) return parseMetricsJson(value);
  return parseMetricEntries(value.split(","));
}

function parseMetricFlags(argv: string[], flags: Record<string, string>): SlideMetric[] {
  const metricEntries = readListFlag(argv, flags, "metric", "metrics");
  return metricEntries.length ? parseMetricEntries(metricEntries) : parseMetrics(flags.metrics || flags.metric);
}

function parseMetricEntries(entries: string[]): SlideMetric[] {
  return entries.map((entry) => {
    if (entry.includes("|")) {
      const [metricValue, label, ...detailParts] = entry.split("|");
      const detail = detailParts.join("|");
      return { label: label?.trim() || "Metric", value: metricValue?.trim() || "", ...(detail.trim() ? { detail: detail.trim() } : {}) };
    }
    const [label, metricValue, ...detailParts] = entry.split("=");
    const detail = detailParts.join("=");
    return { label: label?.trim() || "Metric", value: metricValue?.trim() || "", ...(detail.trim() ? { detail: detail.trim() } : {}) };
  }).filter((entry) => entry.value);
}

function parseRows(value: string | undefined): string[][] {
  if (!value?.trim()) return [];
  if (value.trim().startsWith("[")) return parseRowsJson(value);
  return value.split(";").map((row) => row.split("|").map((cell) => cell.trim()));
}

function parseMetricsJson(value: string): SlideMetric[] {
  const parsed = parseJsonFlag(value, "invalid_slides_metrics_json", "--metrics JSON must be an array of objects with string label/value fields.");
  if (!Array.isArray(parsed) || parsed.some((metric) => !isSlideMetricJson(metric))) {
    throw new CliHandledError("invalid_slides_metrics_json", "--metrics JSON must be an array of objects with string label/value fields.", CLI_EXIT_USAGE);
  }
  return parsed as SlideMetric[];
}

function isSlideMetricJson(value: unknown): value is SlideMetric {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof (value as SlideMetric).label === "string"
    && typeof (value as SlideMetric).value === "string"
    && ((value as SlideMetric).detail === undefined || typeof (value as SlideMetric).detail === "string");
}

function parseRowsFlag(flags: Record<string, string>): string[][] {
  if (flags["rows-json"] !== undefined) {
    return parseRowsJson(flags["rows-json"]);
  }
  return parseRows(flags.rows);
}

function parseRowsJson(value: string): string[][] {
  if (!value.trim()) return [];
  const parsed = parseJsonFlag(value, "invalid_slides_rows_json", "--rows-json must be a JSON array of string arrays.");
  if (!Array.isArray(parsed) || parsed.some((row) => !Array.isArray(row) || row.some((cell) => typeof cell !== "string"))) {
    throw new CliHandledError("invalid_slides_rows_json", "--rows-json must be a JSON array of string arrays.", CLI_EXIT_USAGE);
  }
  return parsed as string[][];
}

function parseJsonFlag(value: string, code: string, message: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new CliHandledError(code, message, CLI_EXIT_USAGE);
  }
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

function isExternalImageSrc(value: string): boolean {
  return /^(https?:|data:)/i.test(value.trim());
}

function imageSrcForHtml(cwd: string, value: string): string {
  return isExternalImageSrc(value) ? value : pathToFileURL(resolveInputPath(cwd, value)).href;
}

function readImageDimensions(filePath: string): { width: number; height: number } | null {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".svg") {
    const source = buffer.toString("utf8", 0, Math.min(buffer.length, 4096));
    const width = source.match(/\bwidth=["']?([0-9.]+)/i)?.[1];
    const height = source.match(/\bheight=["']?([0-9.]+)/i)?.[1];
    const viewBox = source.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
    const parsedWidth = Number(width ?? viewBox?.[1]);
    const parsedHeight = Number(height ?? viewBox?.[2]);
    if (Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight) && parsedWidth > 0 && parsedHeight > 0) {
      return { width: parsedWidth, height: parsedHeight };
    }
  }
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
