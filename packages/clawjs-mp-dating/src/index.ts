// `dating/v1` plugin for the Clawix mp/* protocol.
//
// Two key differences from other verticals:
//   1. Mutual-match flow: an Offer is only shown to a Want that both sides
//      have implicitly opted into (via the `looking_for` filter). The actual
//      reveal of contact data happens *only* after both sides issue a
//      `mutual-match` capability — not on the first inquiry.
//   2. Most fields are at audience level "audience" or higher by default;
//      `photos_full` and contact data are at "inner-circle" and only reachable
//      via the mutual-match capability.

import type { CborValue } from "@clawjs/mp/cbor";
import { discoveryKey } from "@clawjs/mp";
import type { MpVerticalPlugin } from "@clawjs/mp/verticals/plugin";

export const DATING_VERTICAL_ID = "dating/v1";
export const DATING_MUTUAL_MATCH_CAPABILITY = "mutual-match";

export type LookingFor = "long-term" | "short-term" | "casual" | "friends" | "open-to-anything";

export interface DatingOffer {
  display_name: string;          // alias-like, not full name
  birth_year: number;
  pronouns?: string;
  bio: string;                   // ≤ 1000 chars
  prompts?: { question: string; answer: string }[];
  photos_blurred: { hash: Uint8Array; size: number; mime: string }[];
  photos_full?: { hash: Uint8Array; size: number; mime: string }[];
  looking_for: LookingFor[];
  age_min?: number;
  age_max?: number;
  distance_km?: number;
  geo_zone: string;              // 4-char geohash
  deal_breakers?: string[];      // user-defined hard nos
  has_kids?: boolean;
  wants_kids?: "yes" | "no" | "maybe";
  smokes?: boolean;
  drinks?: "never" | "sometimes" | "often";
  height_cm?: number;
  contact_handle?: string;
}

export interface DatingWant {
  geo_zone: string;
  distance_km?: number;
  age_min: number;
  age_max: number;
  looking_for: LookingFor[];
  deal_breakers?: string[];
  contact_handle?: string;
}

export const DATING_OFFER_VISIBILITY: Record<string, string> = {
  display_name: "public",
  birth_year: "public",
  pronouns: "public",
  bio: "audience",
  prompts: "audience",
  photos_blurred: "public",
  photos_full: "inner-circle",
  looking_for: "public",
  age_min: "public",
  age_max: "public",
  distance_km: "public",
  geo_zone: "public",
  deal_breakers: "audience",
  has_kids: "audience",
  wants_kids: "audience",
  smokes: "audience",
  drinks: "audience",
  height_cm: "audience",
  contact_handle: "inner-circle",
};

export const DATING_WANT_VISIBILITY: Record<string, string> = {
  geo_zone: "public",
  distance_km: "public",
  age_min: "public",
  age_max: "public",
  looking_for: "public",
  deal_breakers: "audience",
  contact_handle: "inner-circle",
};

export function validateDatingOffer(input: DatingOffer): void {
  if (!input.display_name) throw new Error("dating: display_name required");
  if (input.display_name.length > 32) throw new Error("dating: display_name ≤ 32 chars");
  if (!Number.isInteger(input.birth_year) || input.birth_year < 1900) throw new Error("dating: birth_year invalid");
  const ageNow = new Date().getUTCFullYear() - input.birth_year;
  if (ageNow < 18) throw new Error("dating: profiles must be 18+");
  if (typeof input.bio !== "string" || input.bio.length === 0) throw new Error("dating: bio required");
  if (input.bio.length > 1000) throw new Error("dating: bio ≤ 1000 chars");
  if (!Array.isArray(input.photos_blurred) || input.photos_blurred.length === 0) {
    throw new Error("dating: at least one blurred photo required");
  }
  if (!input.looking_for || input.looking_for.length === 0) {
    throw new Error("dating: looking_for required (at least one entry)");
  }
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("dating: geo_zone must be 4-char geohash");
  if (input.age_min && input.age_max && input.age_min > input.age_max) {
    throw new Error("dating: age_min must be ≤ age_max");
  }
}

export function validateDatingWant(input: DatingWant): void {
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("dating: geo_zone must be 4-char geohash");
  if (input.age_min < 18) throw new Error("dating: age_min must be ≥ 18");
  if (input.age_max < input.age_min) throw new Error("dating: age_max must be ≥ age_min");
  if (!input.looking_for || input.looking_for.length === 0) {
    throw new Error("dating: looking_for required (at least one entry)");
  }
}

export function datingOfferToCbor(offer: DatingOffer): Record<string, CborValue> {
  validateDatingOffer(offer);
  const out: Record<string, CborValue> = {
    display_name: offer.display_name,
    birth_year: offer.birth_year,
    bio: offer.bio,
    photos_blurred: offer.photos_blurred.map((p) => ({ hash: p.hash, size: p.size, mime: p.mime })),
    looking_for: offer.looking_for,
    geo_zone: offer.geo_zone,
  };
  if (offer.pronouns) out.pronouns = offer.pronouns;
  if (offer.prompts) out.prompts = offer.prompts.map((p) => ({ question: p.question, answer: p.answer }));
  if (offer.photos_full) out.photos_full = offer.photos_full.map((p) => ({ hash: p.hash, size: p.size, mime: p.mime }));
  if (offer.age_min !== undefined) out.age_min = offer.age_min;
  if (offer.age_max !== undefined) out.age_max = offer.age_max;
  if (offer.distance_km !== undefined) out.distance_km = offer.distance_km;
  if (offer.deal_breakers) out.deal_breakers = offer.deal_breakers;
  if (offer.has_kids !== undefined) out.has_kids = offer.has_kids;
  if (offer.wants_kids) out.wants_kids = offer.wants_kids;
  if (offer.smokes !== undefined) out.smokes = offer.smokes;
  if (offer.drinks) out.drinks = offer.drinks;
  if (offer.height_cm !== undefined) out.height_cm = offer.height_cm;
  if (offer.contact_handle) out.contact_handle = offer.contact_handle;
  return out;
}

export function datingWantToCbor(want: DatingWant): Record<string, CborValue> {
  validateDatingWant(want);
  const out: Record<string, CborValue> = {
    geo_zone: want.geo_zone,
    age_min: want.age_min,
    age_max: want.age_max,
    looking_for: want.looking_for,
  };
  if (want.distance_km !== undefined) out.distance_km = want.distance_km;
  if (want.deal_breakers) out.deal_breakers = want.deal_breakers;
  if (want.contact_handle) out.contact_handle = want.contact_handle;
  return out;
}

export function datingDiscoveryKey(opts: { geo_zone: string; looking_for: LookingFor }): Uint8Array {
  return discoveryKey({
    vertical: DATING_VERTICAL_ID,
    geoZone: opts.geo_zone,
    tag: opts.looking_for,
  });
}

export const datingPlugin: MpVerticalPlugin<DatingOffer, DatingWant> = {
  id: DATING_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: { ...DATING_OFFER_VISIBILITY, ...DATING_WANT_VISIBILITY },
  matchExtractors: {
    offer: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: (fields.looking_for as string[] | undefined)?.[0],
    }),
    want: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: (fields.looking_for as string[] | undefined)?.[0],
    }),
  },
  uiHints: { surface: "swipe", preferredCard: "swipe-stack", primaryAction: "swipe", showsPhotos: true },
  validator: {
    validateOffer: validateDatingOffer,
    validateWant: validateDatingWant,
    offerToCbor: datingOfferToCbor,
    wantToCbor: datingWantToCbor,
  },
};
