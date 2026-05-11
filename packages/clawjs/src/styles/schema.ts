export const STYLE_SCHEMA_VERSION = 1;

export type StyleColorTokens = {
  bg: string;
  surface: string;
  "surface-2"?: string;
  fg: string;
  "fg-muted"?: string;
  accent: string;
  "accent-2"?: string;
  success?: string;
  warn?: string;
  danger?: string;
  border?: string;
  overlay?: string;
  [key: string]: string | undefined;
};

export interface StyleTypographyStack {
  family: string;
  fallback?: string;
  weight?: number;
  source?: "system" | "google" | "local";
}

export interface StyleTypographyScale {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  "2xl": number;
  "3xl": number;
}

export interface StyleTypographyTokens {
  display: StyleTypographyStack;
  body: StyleTypographyStack;
  mono: StyleTypographyStack;
  scale: StyleTypographyScale;
  lineHeight?: { tight?: number; normal?: number; relaxed?: number };
  letterSpacing?: { tight?: number; normal?: number; wide?: number };
}

export interface StyleSpacingTokens {
  unit: number;
  scale: Record<string, number>;
}

export interface StyleRadiusTokens {
  none: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
  squircle?: number;
}

export interface StyleShadowToken {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread?: number;
  color: string;
}

export interface StyleShadowTokens {
  sm: StyleShadowToken;
  md: StyleShadowToken;
  lg: StyleShadowToken;
}

export interface StyleMotionTokens {
  curves: Record<string, string>;
  durations: Record<string, number>;
}

export interface StyleTokens {
  color: StyleColorTokens;
  typography: StyleTypographyTokens;
  spacing: StyleSpacingTokens;
  radius: StyleRadiusTokens;
  shadow: StyleShadowTokens;
  motion: StyleMotionTokens;
}

export interface StyleLogoVariant {
  variant: "mark" | "wordmark" | "lockup";
  theme: "light" | "dark";
  format: "svg" | "png";
  path: string;
}

export interface StyleBrand {
  logos?: StyleLogoVariant[];
  voice?: string;
  do_dont?: string;
  glossary?: string;
  taglines?: string[];
  claims?: string[];
  naming?: string;
}

export interface StyleImagery {
  photography?: string;
  illustration?: string;
  iconography?: string;
  generation_prompt_suffix?: string;
  negative_prompt?: string;
  references?: string[];
}

export type StyleFormat =
  | "web"
  | "slides"
  | "pdf"
  | "doc"
  | "social"
  | "email"
  | "motion";

export type StyleOverrides = Partial<Record<StyleFormat, Record<string, unknown>>>;

export interface StyleManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  tokens: StyleTokens;
  brand?: StyleBrand;
  imagery?: StyleImagery;
  overrides?: StyleOverrides;
  references?: string[];
  examples?: string[];
  createdAt: string;
  updatedAt: string;
  builtin?: boolean;
}

export const STYLE_FORMATS: StyleFormat[] = [
  "web",
  "slides",
  "pdf",
  "doc",
  "social",
  "email",
  "motion",
];

export function isStyleFormat(value: string): value is StyleFormat {
  return (STYLE_FORMATS as string[]).includes(value);
}
