import type { StyleManifest } from "../../styles/schema.ts";
import type {
  TemplateAspect,
  TemplateManifest,
  TemplateSlot,
  TemplateSlotKind,
} from "../schema.ts";

export interface RenderHtmlOptions {
  template: TemplateManifest;
  style: StyleManifest;
  data: Record<string, unknown>;
  variantId?: string;
  embeddedAssetsBase?: string;
}

export interface RenderHtmlResult {
  html: string;
  width: number;
  height: number;
}

const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "4:3": { width: 1280, height: 960 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "a4-portrait": { width: 794, height: 1123 },
  "a4-landscape": { width: 1123, height: 794 },
  "letter-portrait": { width: 816, height: 1056 },
  "letter-landscape": { width: 1056, height: 816 },
};

export function resolveAspectDimensions(aspect: TemplateAspect): { width: number; height: number } {
  if (typeof aspect === "string") {
    return ASPECT_DIMENSIONS[aspect] ?? { width: 1280, height: 720 };
  }
  if (aspect.unit === "px") return { width: aspect.width, height: aspect.height };
  const factor = 3.7795; // mm -> px at 96 DPI
  return { width: Math.round(aspect.width * factor), height: Math.round(aspect.height * factor) };
}

export function renderTemplateHtml(options: RenderHtmlOptions): RenderHtmlResult {
  const { template, style, data, variantId } = options;
  const { width, height } = resolveAspectDimensions(template.aspect);
  const variant = template.variants.find((v) => v.id === variantId) ?? template.variants[0];
  const styleVars = buildStyleVars(style);
  const slotsHtml = template.slots.map((slot) => renderSlot(slot, data[slot.id], style)).join("\n");
  const labelLine = variant.label ? `<div class="meta">${esc(template.name)} · ${esc(variant.label)}</div>` : `<div class="meta">${esc(template.name)}</div>`;
  const body = `<div class="frame">\n  ${labelLine}\n  <div class="content">\n    ${slotsHtml}\n  </div>\n</div>`;
  const head = `<meta charset="utf-8">\n<meta name="viewport" content="width=${width}">\n<style>${baseCss(width, height)}\n${themeCss(styleVars)}</style>`;
  const html = `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>`;
  return { html, width, height };
}

function buildStyleVars(style: StyleManifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(style.tokens.color)) {
    if (typeof value === "string") out[`--color-${key}`] = value;
  }
  out["--font-display"] = style.tokens.typography.display.family;
  out["--font-body"] = style.tokens.typography.body.family;
  out["--font-mono"] = style.tokens.typography.mono.family;
  for (const [key, size] of Object.entries(style.tokens.typography.scale)) {
    out[`--font-size-${key}`] = `${size}px`;
  }
  for (const [key, value] of Object.entries(style.tokens.spacing.scale)) {
    out[`--space-${key}`] = `${value}px`;
  }
  out["--radius-sm"] = `${style.tokens.radius.sm}px`;
  out["--radius-md"] = `${style.tokens.radius.md}px`;
  out["--radius-lg"] = `${style.tokens.radius.lg}px`;
  out["--radius-xl"] = `${style.tokens.radius.xl}px`;
  out["--radius-squircle"] = `${style.tokens.radius.squircle ?? style.tokens.radius.lg}px`;
  return out;
}

function themeCss(vars: Record<string, string>): string {
  const decls = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `:root{\n${decls}\n}`;
}

function baseCss(width: number, height: number): string {
  return `*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:var(--font-body);color:var(--color-fg);background:var(--color-bg);}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
.frame{width:${width}px;height:${height}px;background:var(--color-surface);border:1px solid var(--color-border, transparent);border-radius:var(--radius-lg);overflow:hidden;display:flex;flex-direction:column;position:relative;}
.frame .meta{position:absolute;top:12px;right:16px;font-family:var(--font-mono);font-size:11px;color:var(--color-fg-muted);opacity:0.6;letter-spacing:0.05em;}
.frame .content{flex:1;display:flex;flex-direction:column;gap:var(--space-4, 16px);padding:var(--space-12, 48px);}
.heading{font-family:var(--font-display);font-size:var(--font-size-2xl);line-height:1.05;letter-spacing:-0.02em;color:var(--color-fg);}
.subheading{font-family:var(--font-display);font-size:var(--font-size-lg);line-height:1.2;color:var(--color-fg-muted, var(--color-fg));}
.body{font-family:var(--font-body);font-size:var(--font-size-md);line-height:1.5;color:var(--color-fg);}
.list{font-family:var(--font-body);font-size:var(--font-size-md);line-height:1.6;color:var(--color-fg);padding-left:var(--space-5, 20px);}
.list li{margin-bottom:var(--space-2, 8px);}
.quote{font-family:var(--font-display);font-size:var(--font-size-xl);line-height:1.3;color:var(--color-accent);font-style:italic;border-left:3px solid var(--color-accent);padding-left:var(--space-4, 16px);}
.metric{font-family:var(--font-display);font-size:var(--font-size-3xl);line-height:1.0;color:var(--color-accent);letter-spacing:-0.02em;}
.button{display:inline-block;padding:var(--space-3, 12px) var(--space-5, 20px);background:var(--color-accent);color:var(--color-bg);font-family:var(--font-body);font-size:var(--font-size-md);border-radius:var(--radius-squircle);text-decoration:none;align-self:flex-start;}
.image{background:var(--color-surface-2, var(--color-surface));border-radius:var(--radius-md);min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--color-fg-muted);font-family:var(--font-mono);font-size:var(--font-size-xs);overflow:hidden;}
.image img{width:100%;height:100%;object-fit:cover;border-radius:var(--radius-md);}
.logo{font-family:var(--font-display);font-size:var(--font-size-md);font-weight:700;color:var(--color-fg);letter-spacing:-0.01em;}
.divider{height:1px;background:var(--color-border, var(--color-fg-muted));opacity:0.3;}
.shape{background:var(--color-accent);border-radius:var(--radius-md);min-height:40px;}
.table{font-family:var(--font-body);font-size:var(--font-size-sm);width:100%;border-collapse:collapse;}
.table th,.table td{text-align:left;padding:var(--space-2, 8px) var(--space-3, 12px);border-bottom:1px solid var(--color-border, var(--color-fg-muted));}
.slot-empty{color:var(--color-fg-muted, var(--color-fg));opacity:0.4;font-style:italic;}`;
}

function renderSlot(slot: TemplateSlot, value: unknown, style: StyleManifest): string {
  const empty = isEmpty(value);
  switch (slot.kind) {
    case "heading":
      return `<h1 class="heading"${dataAttrs(slot)}>${renderText(value, slot, `[${slot.label}]`, empty)}</h1>`;
    case "subheading":
      return `<h2 class="subheading"${dataAttrs(slot)}>${renderText(value, slot, `[${slot.label}]`, empty)}</h2>`;
    case "body":
      return `<p class="body"${dataAttrs(slot)}>${renderText(value, slot, slot.placeholder ?? `[${slot.label}]`, empty)}</p>`;
    case "quote":
      return `<blockquote class="quote"${dataAttrs(slot)}>${renderText(value, slot, slot.placeholder ?? `[${slot.label}]`, empty)}</blockquote>`;
    case "metric":
      return `<div class="metric"${dataAttrs(slot)}>${renderText(value, slot, "—", empty)}</div>`;
    case "button": {
      const text = empty ? slot.label ?? "Button" : escMultiline(String(value));
      return `<a class="button" href="#"${dataAttrs(slot)}>${text}</a>`;
    }
    case "image": {
      const src = typeof value === "string" ? value : (value as { src?: string } | null)?.src;
      if (src) return `<div class="image"${dataAttrs(slot)}><img src="${esc(src)}" alt="${esc(slot.label)}"/></div>`;
      return `<div class="image"${dataAttrs(slot)}>${esc(slot.label)}</div>`;
    }
    case "logo": {
      const src = typeof value === "string" ? value : style.brand?.logos?.[0]?.path;
      if (src) return `<div class="logo"${dataAttrs(slot)}><img src="${esc(src)}" alt="logo" style="max-height:32px;"/></div>`;
      return `<div class="logo"${dataAttrs(slot)}>${esc(style.name)}</div>`;
    }
    case "divider":
      return `<div class="divider"${dataAttrs(slot)}></div>`;
    case "shape":
      return `<div class="shape"${dataAttrs(slot)}></div>`;
    case "list": {
      const items = toStringArray(value);
      if (!items.length) return `<ul class="list"${dataAttrs(slot)}><li class="slot-empty">[${esc(slot.label)}]</li></ul>`;
      return `<ul class="list"${dataAttrs(slot)}>${items.map((i) => `<li>${escMultiline(i)}</li>`).join("")}</ul>`;
    }
    case "table": {
      const rows = toRows(value);
      if (!rows.length) return `<div class="slot-empty"${dataAttrs(slot)}>[${esc(slot.label)}]</div>`;
      const head = rows[0];
      const body = rows.slice(1);
      const headHtml = `<thead><tr>${head.map((c) => `<th>${escMultiline(c)}</th>`).join("")}</tr></thead>`;
      const bodyHtml = `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${escMultiline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      return `<table class="table"${dataAttrs(slot)}>${headHtml}${bodyHtml}</table>`;
    }
    default:
      return `<div${dataAttrs(slot)}>${renderText(value, slot, `[${slot.label}]`, empty)}</div>`;
  }
}

function dataAttrs(slot: TemplateSlot): string {
  return ` data-slot-id="${esc(slot.id)}" data-slot-kind="${slot.kind}"`;
}

function renderText(value: unknown, slot: TemplateSlot, placeholder: string, isEmpty: boolean): string {
  if (isEmpty) return `<span class="slot-empty">${esc(placeholder)}</span>`;
  return escMultiline(String(value));
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => v !== null && v !== undefined).map((v) => String(v));
}

function toRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")]);
}

function esc(input: string | undefined | null): string {
  if (input == null) return "";
  return String(input).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

function escMultiline(input: string): string {
  return esc(input).replace(/\n/g, "<br>");
}

const SUPPORTED_SLOT_KINDS: TemplateSlotKind[] = [
  "heading",
  "subheading",
  "body",
  "quote",
  "metric",
  "button",
  "image",
  "logo",
  "divider",
  "shape",
  "list",
  "table",
];
