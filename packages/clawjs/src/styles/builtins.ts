import type {
  StyleManifest,
  StyleMotionTokens,
  StyleRadiusTokens,
  StyleShadowTokens,
  StyleSpacingTokens,
  StyleTokens,
  StyleTypographyTokens,
} from "./schema.ts";

const SHARED_SPACING: StyleSpacingTokens = {
  unit: 4,
  scale: { "0": 0, "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40, "12": 48, "16": 64, "20": 80, "24": 96 },
};

const SHARED_RADIUS: StyleRadiusTokens = { none: 0, sm: 4, md: 8, lg: 12, xl: 20, full: 9999, squircle: 16 };

const SHARED_MOTION: StyleMotionTokens = {
  curves: {
    "ease-out-cubic": "cubic-bezier(0.215, 0.61, 0.355, 1)",
    "ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
    "ease-out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    linear: "linear",
  },
  durations: { xs: 120, sm: 180, md: 240, lg: 320, xl: 480 },
};

function shadowsFor(color: string): StyleShadowTokens {
  return {
    sm: { offsetX: 0, offsetY: 1, blur: 2, color: `${color}1A` },
    md: { offsetX: 0, offsetY: 4, blur: 12, color: `${color}26` },
    lg: { offsetX: 0, offsetY: 10, blur: 28, color: `${color}33` },
  };
}

function typographyFor(display: string, body: string, mono: string): StyleTypographyTokens {
  return {
    display: { family: display, source: "system" },
    body: { family: body, source: "system" },
    mono: { family: mono, source: "system" },
    scale: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, "2xl": 40, "3xl": 56 },
    lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.6 },
    letterSpacing: { tight: -0.4, normal: 0, wide: 0.4 },
  };
}

interface ThemeSeed {
  id: string;
  name: string;
  description: string;
  tags: string[];
  color: {
    bg: string;
    surface: string;
    fg: string;
    fgMuted: string;
    accent: string;
    accent2: string;
    panel: string;
    border: string;
  };
  display: string;
  body: string;
  mono: string;
}

const SEEDS: ThemeSeed[] = [
  {
    id: "editorial",
    name: "Editorial",
    description: "Serif-led editorial theme. Warm paper background, deep ink foreground.",
    tags: ["builtin", "editorial", "print"],
    color: { bg: "#f5f0e8", surface: "#fffaf2", fg: "#151719", fgMuted: "#6d655d", accent: "#b9412f", accent2: "#244f7a", panel: "#fffaf2", border: "#e1d8c8" },
    display: "Georgia, 'Times New Roman', serif",
    body: "Georgia, 'Times New Roman', serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "studio",
    name: "Studio",
    description: "Bright neutral background with teal accent. Balanced sans for product decks and one-pagers.",
    tags: ["builtin", "studio", "product"],
    color: { bg: "#f8f7f3", surface: "#ffffff", fg: "#1d2328", fgMuted: "#65717b", accent: "#0f8b8d", accent2: "#f25f5c", panel: "#ffffff", border: "#e6e3dc" },
    display: "Inter, Arial, sans-serif",
    body: "Inter, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep navy backdrop with luminous accent. Reads well in dim rooms, conference settings.",
    tags: ["builtin", "dark", "presentation"],
    color: { bg: "#09111f", surface: "#111f33", fg: "#f6f8fb", fgMuted: "#a9b7c8", accent: "#57c7ff", accent2: "#a78bfa", panel: "#111f33", border: "#1d2d49" },
    display: "Inter, Arial, sans-serif",
    body: "Inter, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "signal",
    name: "Signal",
    description: "Forest-toned dark theme. Green/amber accents for data and operational dashboards.",
    tags: ["builtin", "dark", "data"],
    color: { bg: "#0e1512", surface: "#17231d", fg: "#f3f8f1", fgMuted: "#a8b8ad", accent: "#59d98e", accent2: "#ffd166", panel: "#17231d", border: "#1b2e25" },
    display: "Aptos, Arial, sans-serif",
    body: "Aptos, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "paper",
    name: "Paper",
    description: "Cool paper background, blue/orange accents. Neutral, friendly for documentation.",
    tags: ["builtin", "paper", "docs"],
    color: { bg: "#fbfaf7", surface: "#f0eee8", fg: "#202124", fgMuted: "#6f6f68", accent: "#3867d6", accent2: "#e15f41", panel: "#f0eee8", border: "#e1ddd1" },
    display: "Aptos, Arial, sans-serif",
    body: "Aptos, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "executive",
    name: "Executive",
    description: "Conservative business theme. Navy + ochre on cool white. Boardroom appropriate.",
    tags: ["builtin", "business", "report"],
    color: { bg: "#f6f7f9", surface: "#ffffff", fg: "#111827", fgMuted: "#5f6b7a", accent: "#1f4e79", accent2: "#9a6a19", panel: "#ffffff", border: "#dfe3ea" },
    display: "Arial, sans-serif",
    body: "Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "product",
    name: "Product",
    description: "Cool product launch theme. Teal + blue accents on near-white. Heavy on whitespace.",
    tags: ["builtin", "product", "launch"],
    color: { bg: "#f7fbff", surface: "#ffffff", fg: "#112033", fgMuted: "#617084", accent: "#0d9488", accent2: "#2563eb", panel: "#ffffff", border: "#dde7f0" },
    display: "Inter, Arial, sans-serif",
    body: "Inter, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "mono",
    name: "Mono",
    description: "Monospace throughout. Stark grayscale. For code-heavy artifacts and technical specs.",
    tags: ["builtin", "mono", "technical"],
    color: { bg: "#f4f4f2", surface: "#ffffff", fg: "#171717", fgMuted: "#686868", accent: "#111111", accent2: "#777777", panel: "#ffffff", border: "#e0e0de" },
    display: "'SFMono-Regular', Consolas, monospace",
    body: "'SFMono-Regular', Consolas, monospace",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "warm",
    name: "Warm",
    description: "Warm cream background with terracotta and teal. Friendly for community and brand work.",
    tags: ["builtin", "warm", "brand"],
    color: { bg: "#fff7ed", surface: "#fffbf4", fg: "#241a14", fgMuted: "#7c6254", accent: "#c2410c", accent2: "#0f766e", panel: "#fffbf4", border: "#f0e3d2" },
    display: "Aptos, Arial, sans-serif",
    body: "Aptos, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, monospace",
  },
  {
    id: "claw",
    name: "Claw",
    description: "Default Claw house style. Teal anchor with cool secondary. Neutral cream surface.",
    tags: ["builtin", "claw", "house"],
    color: { bg: "#f7f7f4", surface: "#ffffff", fg: "#141a1f", fgMuted: "#62707d", accent: "#15a3a3", accent2: "#315c9c", panel: "#ffffff", border: "#e1e2dd" },
    display: "'Source Sans 3', Arial, sans-serif",
    body: "'Source Sans 3', Arial, sans-serif",
    mono: "'Ubuntu Mono', 'SFMono-Regular', monospace",
  },
];

function tokensFromSeed(seed: ThemeSeed): StyleTokens {
  return {
    color: {
      bg: seed.color.bg,
      surface: seed.color.surface,
      "surface-2": seed.color.panel,
      fg: seed.color.fg,
      "fg-muted": seed.color.fgMuted,
      accent: seed.color.accent,
      "accent-2": seed.color.accent2,
      success: "#16a34a",
      warn: "#eab308",
      danger: "#dc2626",
      border: seed.color.border,
      overlay: "#0000004D",
    },
    typography: typographyFor(seed.display, seed.body, seed.mono),
    spacing: SHARED_SPACING,
    radius: SHARED_RADIUS,
    shadow: shadowsFor(seed.color.fg),
    motion: SHARED_MOTION,
  };
}

export function builtinStyleManifests(): StyleManifest[] {
  const now = new Date("2026-05-11T00:00:00.000Z").toISOString();
  return SEEDS.map((seed) => ({
    schemaVersion: 1 as const,
    id: seed.id,
    name: seed.name,
    description: seed.description,
    tags: seed.tags,
    tokens: tokensFromSeed(seed),
    brand: {
      voice: `Tone for the ${seed.name} style. Edit this section to capture how to write copy in this voice.`,
      do_dont: `- Do: keep copy aligned with the ${seed.name} mood.\n- Don't: introduce conflicting visual cues outside this style.`,
    },
    imagery: {
      generation_prompt_suffix: defaultImagerySuffix(seed),
    },
    overrides: {},
    references: [],
    examples: [],
    createdAt: now,
    updatedAt: now,
    builtin: true,
  }));
}

function defaultImagerySuffix(seed: ThemeSeed): string {
  const palette = `palette ${seed.color.accent}, ${seed.color.accent2}, ${seed.color.bg}`;
  if (seed.tags.includes("dark")) return `${palette}; cinematic, low-key lighting, deep shadows`;
  if (seed.tags.includes("editorial")) return `${palette}; editorial photography, soft natural light, paper texture`;
  if (seed.tags.includes("product")) return `${palette}; clean studio backdrop, soft directional light, product render`;
  if (seed.tags.includes("mono")) return `${palette}; high-contrast monochrome, grain texture`;
  if (seed.tags.includes("warm")) return `${palette}; warm afternoon sunlight, golden hour, cozy ambience`;
  return `${palette}; balanced studio light, neutral background`;
}
