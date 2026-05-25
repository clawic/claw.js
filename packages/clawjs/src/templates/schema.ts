export const TEMPLATE_SCHEMA_VERSION = 1;

export const TEMPLATE_CATEGORIES = [
  "presentation",
  "card",
  "poster",
  "social-post",
  "one-pager",
  "cv",
  "invoice",
  "certificate",
  "menu",
  "flyer",
  "email",
  "business-card",
  "web-landing",
  "brochure",
  "report",
] as const;

export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];

export function isTemplateCategory(value: string): value is TemplateCategory {
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

export type TemplateAspect =
  | "16:9"
  | "4:3"
  | "1:1"
  | "4:5"
  | "9:16"
  | "a4-portrait"
  | "a4-landscape"
  | "letter-portrait"
  | "letter-landscape"
  | { width: number; height: number; unit: "px" | "mm" };

export type TemplateSlotKind =
  | "heading"
  | "subheading"
  | "body"
  | "list"
  | "quote"
  | "metric"
  | "image"
  | "logo"
  | "button"
  | "divider"
  | "shape"
  | "table";

export interface TemplateSlot {
  id: string;
  kind: TemplateSlotKind;
  label: string;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  placeholder?: string;
  defaultValue?: unknown;
  position?: { x: number; y: number; w: number; h: number };
  alignment?: "start" | "center" | "end";
  style?: { token?: string; size?: string; weight?: number };
}

export interface TemplateVariant {
  id: string;
  label: string;
  description?: string;
  preview?: string;
}

export type TemplateOutputFormat = "html" | "pdf" | "png" | "svg" | "pptx";

export interface TemplateManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  category: TemplateCategory;
  aspect: TemplateAspect;
  description?: string;
  tags?: string[];
  slots: TemplateSlot[];
  variants: TemplateVariant[];
  outputs: TemplateOutputFormat[];
  defaultStyleId?: string;
  builtin?: boolean;
  createdAt: string;
  updatedAt: string;
}
