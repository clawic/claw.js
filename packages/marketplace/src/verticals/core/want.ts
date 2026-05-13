// `want/v1` — inverse listing: "I'm looking for X in vertical Y".

import type { CborValue } from "../../cbor.ts";
import type { MarketplaceVerticalPlugin } from "../plugin.ts";

export const WANT_VERTICAL_ID = "want/v1";

export interface WantBlock {
  /** Target vertical id this want is searching for, e.g. "real-estate/v1". */
  vertical_target: string;
  /** Free-form description of what the user is after. */
  description: string;
  geo_zone?: string;
  budget_hint_eur?: number;
  budget_band?: number;            // floor(log10(budget))
  /** Structured criteria specific to the target vertical (rooms, distance, etc.). */
  criteria?: Record<string, CborValue>;
  expires_at?: number;
  contact_handle?: string;
}

const WANT_VISIBILITY: Record<string, string> = {
  vertical_target: "public",
  description: "public",
  geo_zone: "public",
  budget_hint_eur: "public",
  budget_band: "public",
  criteria: "public",
  expires_at: "public",
  contact_handle: "public",
};

function band(value?: number): number | undefined {
  if (value === undefined || value <= 0) return undefined;
  return Math.floor(Math.log10(value));
}

export function validateWant(input: WantBlock): void {
  if (!input.vertical_target) throw new Error("want: vertical_target required");
  if (!input.description) throw new Error("want: description required");
  if (input.description.length > 2048) throw new Error("want: description ≤ 2KB");
  if (input.geo_zone && input.geo_zone.length !== 4) throw new Error("want: geo_zone must be 4-char geohash");
  if (input.budget_hint_eur !== undefined && input.budget_hint_eur < 0) throw new Error("want: budget_hint_eur must be ≥ 0");
  if (input.budget_band !== undefined && input.budget_band !== band(input.budget_hint_eur)) {
    throw new Error("want: budget_band must match floor(log10(budget))");
  }
}

export function wantToCbor(input: WantBlock): Record<string, CborValue> {
  validateWant(input);
  const out: Record<string, CborValue> = {
    vertical_target: input.vertical_target,
    description: input.description,
  };
  if (input.geo_zone) out.geo_zone = input.geo_zone;
  if (input.budget_hint_eur !== undefined) {
    out.budget_hint_eur = input.budget_hint_eur;
    const b = band(input.budget_hint_eur);
    if (b !== undefined) out.budget_band = b;
  }
  if (input.criteria) out.criteria = input.criteria;
  if (input.expires_at !== undefined) out.expires_at = input.expires_at;
  if (input.contact_handle) out.contact_handle = input.contact_handle;
  return out;
}

export const wantPlugin: MarketplaceVerticalPlugin<WantBlock, WantBlock> = {
  id: WANT_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: WANT_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: fields.vertical_target as string | undefined,
      priceBand: fields.budget_band as number | undefined,
    }),
    want: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: fields.vertical_target as string | undefined,
      priceBand: fields.budget_band as number | undefined,
    }),
  },
  uiHints: { surface: "marketplace", preferredCard: "list", primaryAction: "message", showsPhotos: false },
  validator: {
    validateOffer: validateWant,
    validateWant: validateWant,
    offerToCbor: wantToCbor,
    wantToCbor: wantToCbor,
  },
};
