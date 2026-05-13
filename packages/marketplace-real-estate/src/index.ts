// `real-estate/v1` plugin for the Clawix marketplace/* protocol.
//
// This package re-exports the canonical real-estate schema that ships inside
// `@clawjs/marketplace/verticals` and wraps it as a `MpVerticalPlugin` so it can be
// loaded into a `VerticalRegistry` alongside the core verticals.
//
// We keep the schema source in `@clawjs/marketplace/verticals` for now to avoid
// duplicating large field tables. A future release can flip this to be the
// authoritative location and have `@clawjs/marketplace` re-export from here instead.

import type { CborValue } from "@clawjs/marketplace/cbor";
import type { MpVerticalPlugin } from "@clawjs/marketplace/verticals/plugin";
import {
  REAL_ESTATE_VERTICAL_ID,
  REAL_ESTATE_OFFER_VISIBILITY,
  REAL_ESTATE_WANT_VISIBILITY,
  validateOffer,
  offerToCbor,
  validateRealEstateWant,
  realEstateWantToCbor,
  realEstateDiscoveryKey,
  type RealEstateOffer,
  type RealEstateTransaction,
  type RealEstateWant,
} from "@clawjs/marketplace/verticals";

export {
  REAL_ESTATE_VERTICAL_ID,
  REAL_ESTATE_OFFER_VISIBILITY,
  REAL_ESTATE_WANT_VISIBILITY,
  realEstateDiscoveryKey,
};
export type { RealEstateOffer, RealEstateTransaction, RealEstateWant };

const VISIBILITY: Record<string, string> = mapVisibilityToLevels({
  ...REAL_ESTATE_OFFER_VISIBILITY,
  ...REAL_ESTATE_WANT_VISIBILITY,
});

export const realEstatePlugin: MpVerticalPlugin<RealEstateOffer, RealEstateWant> = {
  id: REAL_ESTATE_VERTICAL_ID,
  archetype: "both",
  defaultVisibility: VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => extract(fields),
    want: ({ fields }) => extract(fields),
  },
  uiHints: { surface: "marketplace", preferredCard: "map-pin", primaryAction: "interested", showsPhotos: true },
  validator: {
    validateOffer,
    validateWant: validateRealEstateWant,
    offerToCbor,
    wantToCbor: realEstateWantToCbor,
  },
};

function extract(fields: Record<string, CborValue>): { geoZone?: string; tag?: string; priceBand?: number } {
  return {
    geoZone: fields.geo_zone as string | undefined,
    tag: fields.transaction as string | undefined,
    priceBand: fields.price_band as number | undefined,
  };
}

function mapVisibilityToLevels(numeric: Record<string, number>): Record<string, string> {
  const levels: Record<number, string> = {
    0: "public",
    1: "audience",
    2: "friends",
    3: "family",
    4: "inner-circle",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(numeric)) out[k] = levels[v] ?? "public";
  return out;
}
