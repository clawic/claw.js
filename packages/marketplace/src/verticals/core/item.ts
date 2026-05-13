// `item/v1` — generic second-hand object listing. Either standalone or
// referencing a `clawjs-possessions` record (tracked archetype).

import type { CborValue } from "../../cbor.ts";
import type { MpVerticalPlugin } from "../plugin.ts";

export const ITEM_VERTICAL_ID = "item/v1";

export type ItemCondition = "new" | "like-new" | "good" | "fair" | "for-parts";

export interface ItemBlock {
  title: string;
  description?: string;
  photos: { hash: Uint8Array; mime: string; size: number }[];
  condition: ItemCondition;
  price_hint_eur?: number;
  price_band?: number;       // floor(log10(price))
  geo_zone: string;          // 4-char geohash
  category?: string;         // free-form, used in tag for discovery
  payment_methods_hint?: string[];   // e.g. ["cash", "bizum", "transfer", "swap"]
  contact_phone?: string;
  contact_handle?: string;   // textual handle "@alias.fingerprint"
}

const ITEM_VISIBILITY: Record<string, string> = {
  title: "public",
  description: "public",
  photos: "public",
  condition: "public",
  price_hint_eur: "public",
  price_band: "public",
  geo_zone: "public",
  category: "public",
  payment_methods_hint: "public",
  contact_phone: "friends",
  contact_handle: "public",
};

function priceBand(price?: number): number | undefined {
  if (price === undefined || price <= 0) return undefined;
  return Math.floor(Math.log10(price));
}

export function validateItem(input: ItemBlock): void {
  if (!input.title) throw new Error("item: title required");
  if (input.title.length > 120) throw new Error("item: title ≤ 120 chars");
  if (!Array.isArray(input.photos) || input.photos.length === 0) throw new Error("item: at least one photo");
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("item: geo_zone must be 4-char geohash");
  if (!input.condition) throw new Error("item: condition required");
  if (input.price_hint_eur !== undefined && input.price_hint_eur < 0) {
    throw new Error("item: price_hint_eur must be ≥ 0");
  }
  if (input.price_band !== undefined && input.price_band !== priceBand(input.price_hint_eur)) {
    throw new Error("item: price_band must match floor(log10(price_hint_eur))");
  }
}

export function itemToCbor(input: ItemBlock): Record<string, CborValue> {
  validateItem(input);
  const band = priceBand(input.price_hint_eur);
  const out: Record<string, CborValue> = {
    title: input.title,
    photos: input.photos.map((p) => ({ hash: p.hash, mime: p.mime, size: p.size })),
    condition: input.condition,
    geo_zone: input.geo_zone,
  };
  if (input.description) out.description = input.description;
  if (input.price_hint_eur !== undefined) {
    out.price_hint_eur = input.price_hint_eur;
    if (band !== undefined) out.price_band = band;
  }
  if (input.category) out.category = input.category;
  if (input.payment_methods_hint) out.payment_methods_hint = input.payment_methods_hint;
  if (input.contact_phone) out.contact_phone = input.contact_phone;
  if (input.contact_handle) out.contact_handle = input.contact_handle;
  return out;
}

export const itemPlugin: MpVerticalPlugin<ItemBlock, ItemBlock> = {
  id: ITEM_VERTICAL_ID,
  archetype: "both",
  defaultVisibility: ITEM_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: fields.category as string | undefined,
      priceBand: fields.price_band as number | undefined,
    }),
    want: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: fields.category as string | undefined,
      priceBand: fields.price_band as number | undefined,
    }),
  },
  uiHints: { surface: "marketplace", preferredCard: "grid", primaryAction: "interested", showsPhotos: true },
  validator: {
    validateOffer: validateItem,
    validateWant: validateItem,
    offerToCbor: itemToCbor,
    wantToCbor: itemToCbor,
  },
};
