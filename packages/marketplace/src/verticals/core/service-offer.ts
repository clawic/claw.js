// `service-offer/v1` — generic freelance / service ad.

import type { CborValue } from "../../cbor.ts";
import type { MarketplaceVerticalPlugin } from "../plugin.ts";

export const SERVICE_OFFER_VERTICAL_ID = "service-offer/v1";

export type RateUnit = "per_hour" | "per_day" | "per_project";

export interface ServiceOfferBlock {
  title: string;
  description?: string;
  rate_hint_eur?: number;
  rate_unit?: RateUnit;
  availability?: string;          // free-form e.g. "weekdays 9-19, EU/Madrid"
  skills?: string[];
  portfolio_blocks?: Uint8Array[];   // refs to album/v1 or post/v1 blocks
  geo_zone?: string;
  remote_ok?: boolean;
  contact_handle?: string;
}

const SERVICE_VISIBILITY: Record<string, string> = {
  title: "public",
  description: "public",
  rate_hint_eur: "public",
  rate_unit: "public",
  availability: "public",
  skills: "public",
  portfolio_blocks: "public",
  geo_zone: "public",
  remote_ok: "public",
  contact_handle: "public",
};

export function validateServiceOffer(input: ServiceOfferBlock): void {
  if (!input.title) throw new Error("service-offer: title required");
  if (input.title.length > 120) throw new Error("service-offer: title ≤ 120 chars");
  if (input.geo_zone && input.geo_zone.length !== 4) throw new Error("service-offer: geo_zone must be 4-char geohash");
  if (input.rate_hint_eur !== undefined && input.rate_hint_eur < 0) {
    throw new Error("service-offer: rate_hint_eur must be ≥ 0");
  }
  if (input.skills && input.skills.length > 20) throw new Error("service-offer: too many skills (cap 20)");
}

export function serviceOfferToCbor(input: ServiceOfferBlock): Record<string, CborValue> {
  validateServiceOffer(input);
  const out: Record<string, CborValue> = { title: input.title };
  if (input.description) out.description = input.description;
  if (input.rate_hint_eur !== undefined) out.rate_hint_eur = input.rate_hint_eur;
  if (input.rate_unit) out.rate_unit = input.rate_unit;
  if (input.availability) out.availability = input.availability;
  if (input.skills) out.skills = input.skills;
  if (input.portfolio_blocks) out.portfolio_blocks = input.portfolio_blocks;
  if (input.geo_zone) out.geo_zone = input.geo_zone;
  if (input.remote_ok !== undefined) out.remote_ok = input.remote_ok;
  if (input.contact_handle) out.contact_handle = input.contact_handle;
  return out;
}

export const serviceOfferPlugin: MarketplaceVerticalPlugin<ServiceOfferBlock, ServiceOfferBlock> = {
  id: SERVICE_OFFER_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: SERVICE_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: (fields.skills as string[] | undefined)?.[0],
    }),
    want: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: (fields.skills as string[] | undefined)?.[0],
    }),
  },
  uiHints: { surface: "marketplace", preferredCard: "list", primaryAction: "message", showsPhotos: false },
  validator: {
    validateOffer: validateServiceOffer,
    validateWant: validateServiceOffer,
    offerToCbor: serviceOfferToCbor,
    wantToCbor: serviceOfferToCbor,
  },
};
