export const REFERENCE_SCHEMA_VERSION = 1;

export const REFERENCE_TYPES = ["web", "pdf", "image", "video", "screenshot", "snippet"] as const;
export type ReferenceType = typeof REFERENCE_TYPES[number];

export function isReferenceType(value: string): value is ReferenceType {
  return (REFERENCE_TYPES as readonly string[]).includes(value);
}

export interface ReferenceExtractedStyle {
  paletteHex?: string[];
  primaryFontFamily?: string;
  bodyFontFamily?: string;
  monoFontFamily?: string;
  notes?: string;
  candidateStyleId?: string;
}

export interface ReferenceManifest {
  schemaVersion: 1;
  id: string;
  type: ReferenceType;
  name: string;
  source?: string;
  asset?: string;
  tags?: string[];
  description?: string;
  styleIds?: string[];
  extractedStyle?: ReferenceExtractedStyle;
  createdAt: string;
  updatedAt: string;
}
