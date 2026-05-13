// `vertical.real-estate.v1` — first production vertical for marketplace/1.0.0.

import type { CborValue } from "../cbor.ts";
import { discoveryKey } from "../wire.ts";

export const REAL_ESTATE_VERTICAL_ID = "real-estate/v1";

export type RealEstateTransaction = "sale" | "rental_long" | "rental_short";
export type EnergyRating = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type SellerRole = "owner" | "tenant" | "agency";

export interface RealEstateOffer {
  transaction: RealEstateTransaction;
  title: string;
  summary: string;
  geo_zone: string;       // 4-char geohash
  address_approx: string;
  address_exact?: string; // encrypted at level 3
  surface_m2: number;
  rooms: number;
  bathrooms: number;
  floor?: string;
  elevator: boolean;
  year_built: number;
  energy_rating: EnergyRating;
  furnished: boolean;
  pets_allowed: boolean;
  price_eur: number;
  price_band?: number;    // computed below if missing
  availability_from: string;  // ISO date
  min_term_months?: number;
  deposit_eur?: number;
  photos_blurred: { hash: Uint8Array; size: number; mime: string }[];
  photos_full?: { hash: Uint8Array; size: number; mime: string }[];
  floorplan?: { hash: Uint8Array; size: number; mime: string };
  contact_phone?: string;
  contact_email?: string;
  legal_status?: "clear" | "mortgaged" | "encumbered" | "other";
  seller_role: SellerRole;
}

export interface RealEstateWant {
  transaction: RealEstateTransaction;
  title: string;
  summary: string;
  geo_zone: string;
  address_approx?: string;
  address_exact?: string;
  surface_m2: number;
  rooms: number;
  bathrooms: number;
  floor?: string;
  elevator: boolean;
  year_built?: number;
  energy_rating?: EnergyRating;
  furnished?: boolean;
  pets_allowed?: boolean;
  price_eur: number;          // budget max
  price_band?: number;
  availability_from?: string;
  min_term_months?: number;
  deposit_eur?: number;
  budget_max_eur: number;
  monthly_income_eur?: number;
  proof_of_funds_blob?: { hash: Uint8Array; size: number; mime: string };
  move_in_by?: string;
  household_size?: number;
  has_pets?: boolean;
  is_smoker?: boolean;
  requested_terms?: string;
}

export const REAL_ESTATE_OFFER_VISIBILITY: Record<string, number> = {
  transaction: 0, title: 0, summary: 0, geo_zone: 0,
  address_approx: 1, address_exact: 3,
  surface_m2: 0, rooms: 0, bathrooms: 0, floor: 1, elevator: 0,
  year_built: 0, energy_rating: 0, furnished: 0, pets_allowed: 0,
  price_eur: 0, price_band: 0, availability_from: 0,
  min_term_months: 0, deposit_eur: 1,
  photos_blurred: 0, photos_full: 3, floorplan: 2,
  contact_phone: 4, contact_email: 3,
  legal_status: 1, seller_role: 0,
};

export const REAL_ESTATE_WANT_VISIBILITY: Record<string, number> = {
  transaction: 0, title: 0, summary: 0, geo_zone: 0,
  address_approx: 1, address_exact: 4,
  surface_m2: 0, rooms: 0, bathrooms: 0, floor: 1, elevator: 0,
  year_built: 0, energy_rating: 0, furnished: 0, pets_allowed: 0,
  price_eur: 0, price_band: 0, availability_from: 0,
  min_term_months: 0, deposit_eur: 1,
  budget_max_eur: 0, monthly_income_eur: 2, proof_of_funds_blob: 3,
  move_in_by: 0, household_size: 0, has_pets: 0, is_smoker: 1, requested_terms: 1,
  contact_phone: 4, contact_email: 3,
};

function priceBand(priceEur: number): number {
  if (priceEur <= 0) return 0;
  return Math.floor(Math.log10(priceEur));
}

export function validateOffer(input: RealEstateOffer): void {
  if (!input.title) throw new Error("real-estate: title required");
  if (input.price_eur <= 0) throw new Error("real-estate: price_eur must be > 0");
  if (input.surface_m2 <= 0) throw new Error("real-estate: surface_m2 must be > 0");
  if (input.rooms < 0 || input.bathrooms < 0) throw new Error("real-estate: rooms/bathrooms negative");
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("real-estate: geo_zone must be 4-char geohash");
  if (!input.seller_role) throw new Error("real-estate: seller_role required");
  if (!input.photos_blurred || input.photos_blurred.length === 0) throw new Error("real-estate: at least one blurred photo");
  if (input.price_band !== undefined && input.price_band !== priceBand(input.price_eur)) {
    throw new Error("real-estate: price_band must match floor(log10(price_eur))");
  }
}

export function validateWant(input: RealEstateWant): void {
  if (!input.title) throw new Error("real-estate: title required");
  if (input.price_eur <= 0) throw new Error("real-estate: price_eur must be > 0");
  if (input.budget_max_eur <= 0) throw new Error("real-estate: budget_max_eur must be > 0");
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("real-estate: geo_zone must be 4-char geohash");
}

export function offerToCbor(offer: RealEstateOffer): Record<string, CborValue> {
  validateOffer(offer);
  const band = offer.price_band ?? priceBand(offer.price_eur);
  const out: Record<string, CborValue> = {
    transaction: offer.transaction,
    title: offer.title,
    summary: offer.summary,
    geo_zone: offer.geo_zone,
    address_approx: offer.address_approx,
    surface_m2: offer.surface_m2,
    rooms: offer.rooms,
    bathrooms: offer.bathrooms,
    elevator: offer.elevator,
    year_built: offer.year_built,
    energy_rating: offer.energy_rating,
    furnished: offer.furnished,
    pets_allowed: offer.pets_allowed,
    price_eur: offer.price_eur,
    price_band: band,
    availability_from: offer.availability_from,
    photos_blurred: offer.photos_blurred.map((b) => ({ hash: b.hash, size: b.size, mime: b.mime })),
    seller_role: offer.seller_role,
  };
  if (offer.address_exact !== undefined) out.address_exact = offer.address_exact;
  if (offer.floor !== undefined) out.floor = offer.floor;
  if (offer.min_term_months !== undefined) out.min_term_months = offer.min_term_months;
  if (offer.deposit_eur !== undefined) out.deposit_eur = offer.deposit_eur;
  if (offer.photos_full !== undefined) out.photos_full = offer.photos_full.map((b) => ({ hash: b.hash, size: b.size, mime: b.mime }));
  if (offer.floorplan !== undefined) out.floorplan = { hash: offer.floorplan.hash, size: offer.floorplan.size, mime: offer.floorplan.mime };
  if (offer.contact_phone !== undefined) out.contact_phone = offer.contact_phone;
  if (offer.contact_email !== undefined) out.contact_email = offer.contact_email;
  if (offer.legal_status !== undefined) out.legal_status = offer.legal_status;
  return out;
}

export function wantToCbor(want: RealEstateWant): Record<string, CborValue> {
  validateWant(want);
  const band = want.price_band ?? priceBand(want.price_eur);
  const out: Record<string, CborValue> = {
    transaction: want.transaction,
    title: want.title,
    summary: want.summary,
    geo_zone: want.geo_zone,
    surface_m2: want.surface_m2,
    rooms: want.rooms,
    bathrooms: want.bathrooms,
    elevator: want.elevator,
    price_eur: want.price_eur,
    price_band: band,
    budget_max_eur: want.budget_max_eur,
  };
  if (want.address_approx !== undefined) out.address_approx = want.address_approx;
  if (want.address_exact !== undefined) out.address_exact = want.address_exact;
  if (want.floor !== undefined) out.floor = want.floor;
  if (want.year_built !== undefined) out.year_built = want.year_built;
  if (want.energy_rating !== undefined) out.energy_rating = want.energy_rating;
  if (want.furnished !== undefined) out.furnished = want.furnished;
  if (want.pets_allowed !== undefined) out.pets_allowed = want.pets_allowed;
  if (want.availability_from !== undefined) out.availability_from = want.availability_from;
  if (want.min_term_months !== undefined) out.min_term_months = want.min_term_months;
  if (want.deposit_eur !== undefined) out.deposit_eur = want.deposit_eur;
  if (want.monthly_income_eur !== undefined) out.monthly_income_eur = want.monthly_income_eur;
  if (want.proof_of_funds_blob !== undefined) out.proof_of_funds_blob = { hash: want.proof_of_funds_blob.hash, size: want.proof_of_funds_blob.size, mime: want.proof_of_funds_blob.mime };
  if (want.move_in_by !== undefined) out.move_in_by = want.move_in_by;
  if (want.household_size !== undefined) out.household_size = want.household_size;
  if (want.has_pets !== undefined) out.has_pets = want.has_pets;
  if (want.is_smoker !== undefined) out.is_smoker = want.is_smoker;
  if (want.requested_terms !== undefined) out.requested_terms = want.requested_terms;
  return out;
}

export function realEstateDiscoveryKey(opts: { transaction: RealEstateTransaction; geo_zone: string; price_eur: number }): Uint8Array {
  return discoveryKey({
    vertical: REAL_ESTATE_VERTICAL_ID,
    geoZone: opts.geo_zone,
    tag: opts.transaction,
    priceBand: priceBand(opts.price_eur),
  });
}
