// `modules/vehicle/v1` plugin for the Clawix marketplace/* protocol.
//
// Second-hand vehicle listings: make/model/year/km/fuel/VIN/condition/photos/
// price/geo_zone, with a partial VIN visible to the public and the full VIN
// gated behind inner-circle. `tracked-block` archetype is preferred when the
// user already tracks the vehicle in `@clawjs/vehicle`; standalone is also
// valid for sellers who never logged the vehicle anywhere.

import type { CborValue } from "@clawjs/marketplace/cbor";
import { discoveryKey } from "@clawjs/marketplace";
import type { MpVerticalPlugin } from "@clawjs/marketplace/verticals/plugin";

export const VEHICLE_VERTICAL_ID = "modules/vehicle/v1";

export type VehicleCondition = "new" | "like-new" | "good" | "fair" | "for-parts";
export type VehicleFuelType = "gasoline" | "diesel" | "hybrid" | "plug-in-hybrid" | "electric" | "lpg" | "cng" | "other";
export type VehicleTransaction = "sale" | "rental_long" | "rental_short" | "swap";

export interface VehicleOffer {
  transaction: VehicleTransaction;
  title: string;
  summary?: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  km: number;
  fuel_type: VehicleFuelType;
  transmission?: "manual" | "automatic";
  color?: string;
  doors?: number;
  seats?: number;
  vin_partial?: string;       // last 4 chars publicly
  vin_full?: string;          // full VIN, inner-circle
  condition: VehicleCondition;
  has_full_service_history?: boolean;
  last_service_at?: string;   // ISO date
  photos_blurred: { hash: Uint8Array; size: number; mime: string }[];
  photos_full?: { hash: Uint8Array; size: number; mime: string }[];
  geo_zone: string;           // 4-char geohash
  city?: string;
  price_eur: number;
  price_band?: number;
  payment_methods_hint?: string[];
  contact_phone?: string;
  contact_handle?: string;
}

export interface VehicleWant {
  transaction: VehicleTransaction;
  title: string;
  summary?: string;
  make?: string;
  model?: string;
  year_min?: number;
  year_max?: number;
  km_max?: number;
  fuel_type?: VehicleFuelType;
  transmission?: "manual" | "automatic";
  condition?: VehicleCondition;
  geo_zone: string;
  budget_max_eur: number;
  budget_band?: number;
  contact_handle?: string;
}

export const VEHICLE_OFFER_VISIBILITY: Record<string, string> = {
  transaction: "public", title: "public", summary: "public",
  make: "public", model: "public", variant: "public", year: "public", km: "public",
  fuel_type: "public", transmission: "public", color: "public", doors: "public", seats: "public",
  vin_partial: "public", vin_full: "inner-circle",
  condition: "public", has_full_service_history: "public", last_service_at: "audience",
  photos_blurred: "public", photos_full: "audience",
  geo_zone: "public", city: "public",
  price_eur: "public", price_band: "public",
  payment_methods_hint: "public",
  contact_phone: "friends", contact_handle: "public",
};

export const VEHICLE_WANT_VISIBILITY: Record<string, string> = {
  transaction: "public", title: "public", summary: "public",
  make: "public", model: "public",
  year_min: "public", year_max: "public", km_max: "public",
  fuel_type: "public", transmission: "public", condition: "public",
  geo_zone: "public", budget_max_eur: "public", budget_band: "public",
  contact_handle: "public",
};

function priceBand(price: number): number {
  if (price <= 0) return 0;
  return Math.floor(Math.log10(price));
}

export function validateVehicleOffer(input: VehicleOffer): void {
  if (!input.title) throw new Error("vehicle: title required");
  if (!input.make || !input.model) throw new Error("vehicle: make and model required");
  if (!Number.isInteger(input.year) || input.year < 1900) throw new Error("vehicle: year invalid");
  if (input.km < 0) throw new Error("vehicle: km must be ≥ 0");
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("vehicle: geo_zone must be 4-char geohash");
  if (input.price_eur <= 0) throw new Error("vehicle: price_eur must be > 0");
  if (input.price_band !== undefined && input.price_band !== priceBand(input.price_eur)) {
    throw new Error("vehicle: price_band must match floor(log10(price_eur))");
  }
  if (input.vin_partial && input.vin_partial.length !== 4) {
    throw new Error("vehicle: vin_partial must be exactly 4 chars (last 4 of VIN)");
  }
  if (input.vin_full && input.vin_full.length !== 17) {
    throw new Error("vehicle: vin_full must be exactly 17 chars (canonical VIN)");
  }
  if (!Array.isArray(input.photos_blurred) || input.photos_blurred.length === 0) {
    throw new Error("vehicle: at least one blurred photo required");
  }
}

export function validateVehicleWant(input: VehicleWant): void {
  if (!input.title) throw new Error("vehicle: title required");
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("vehicle: geo_zone must be 4-char geohash");
  if (input.budget_max_eur <= 0) throw new Error("vehicle: budget_max_eur must be > 0");
  if (input.year_min && input.year_max && input.year_min > input.year_max) {
    throw new Error("vehicle: year_min must be ≤ year_max");
  }
}

export function vehicleOfferToCbor(offer: VehicleOffer): Record<string, CborValue> {
  validateVehicleOffer(offer);
  const band = offer.price_band ?? priceBand(offer.price_eur);
  const out: Record<string, CborValue> = {
    transaction: offer.transaction,
    title: offer.title,
    make: offer.make,
    model: offer.model,
    year: offer.year,
    km: offer.km,
    fuel_type: offer.fuel_type,
    condition: offer.condition,
    geo_zone: offer.geo_zone,
    price_eur: offer.price_eur,
    price_band: band,
    photos_blurred: offer.photos_blurred.map((p) => ({ hash: p.hash, size: p.size, mime: p.mime })),
  };
  if (offer.summary) out.summary = offer.summary;
  if (offer.variant) out.variant = offer.variant;
  if (offer.transmission) out.transmission = offer.transmission;
  if (offer.color) out.color = offer.color;
  if (offer.doors !== undefined) out.doors = offer.doors;
  if (offer.seats !== undefined) out.seats = offer.seats;
  if (offer.vin_partial) out.vin_partial = offer.vin_partial;
  if (offer.vin_full) out.vin_full = offer.vin_full;
  if (offer.has_full_service_history !== undefined) out.has_full_service_history = offer.has_full_service_history;
  if (offer.last_service_at) out.last_service_at = offer.last_service_at;
  if (offer.photos_full) out.photos_full = offer.photos_full.map((p) => ({ hash: p.hash, size: p.size, mime: p.mime }));
  if (offer.city) out.city = offer.city;
  if (offer.payment_methods_hint) out.payment_methods_hint = offer.payment_methods_hint;
  if (offer.contact_phone) out.contact_phone = offer.contact_phone;
  if (offer.contact_handle) out.contact_handle = offer.contact_handle;
  return out;
}

export function vehicleWantToCbor(want: VehicleWant): Record<string, CborValue> {
  validateVehicleWant(want);
  const band = want.budget_band ?? priceBand(want.budget_max_eur);
  const out: Record<string, CborValue> = {
    transaction: want.transaction,
    title: want.title,
    geo_zone: want.geo_zone,
    budget_max_eur: want.budget_max_eur,
    budget_band: band,
  };
  if (want.summary) out.summary = want.summary;
  if (want.make) out.make = want.make;
  if (want.model) out.model = want.model;
  if (want.year_min !== undefined) out.year_min = want.year_min;
  if (want.year_max !== undefined) out.year_max = want.year_max;
  if (want.km_max !== undefined) out.km_max = want.km_max;
  if (want.fuel_type) out.fuel_type = want.fuel_type;
  if (want.transmission) out.transmission = want.transmission;
  if (want.condition) out.condition = want.condition;
  if (want.contact_handle) out.contact_handle = want.contact_handle;
  return out;
}

export function vehicleDiscoveryKey(input: { transaction: VehicleTransaction; geo_zone: string; price_eur: number }): Uint8Array {
  return discoveryKey({
    vertical: VEHICLE_VERTICAL_ID,
    geoZone: input.geo_zone,
    tag: input.transaction,
    priceBand: priceBand(input.price_eur),
  });
}

export const vehiclePlugin: MpVerticalPlugin<VehicleOffer, VehicleWant> = {
  id: VEHICLE_VERTICAL_ID,
  archetype: "both",
  defaultVisibility: { ...VEHICLE_OFFER_VISIBILITY, ...VEHICLE_WANT_VISIBILITY },
  matchExtractors: {
    offer: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: fields.transaction as string | undefined,
      priceBand: fields.price_band as number | undefined,
    }),
    want: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: fields.transaction as string | undefined,
      priceBand: fields.budget_band as number | undefined,
    }),
  },
  uiHints: { surface: "marketplace", preferredCard: "grid", primaryAction: "interested", showsPhotos: true },
  validator: {
    validateOffer: validateVehicleOffer,
    validateWant: validateVehicleWant,
    offerToCbor: vehicleOfferToCbor,
    wantToCbor: vehicleWantToCbor,
  },
};
