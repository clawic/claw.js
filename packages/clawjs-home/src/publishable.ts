// Publishable mapping for the `home` tracking module.

import type {
  PublishableField, PublishableProvider, PublishableSnapshot, PublishableUpdateListener,
} from "@clawjs/tracking-runtime";

export const HOME_MODULE = "home" as const;

export const HOME_PUBLISHABLE_FIELDS: PublishableField[] = Object.freeze([
  { id: "home.geo_zone", label: "Neighbourhood", defaultAudience: "public", match: true },
  { id: "home.address_approx", label: "Approximate address", defaultAudience: "friends" },
  { id: "home.address_exact", label: "Exact address", defaultAudience: "inner-circle" },
  { id: "home.surface_m2", label: "Surface (m²)", defaultAudience: "public" },
  { id: "home.rooms", label: "Rooms", defaultAudience: "public" },
  { id: "home.bathrooms", label: "Bathrooms", defaultAudience: "public" },
  { id: "home.floor", label: "Floor", defaultAudience: "public" },
  { id: "home.elevator", label: "Elevator", defaultAudience: "public" },
  { id: "home.year_built", label: "Year built", defaultAudience: "public" },
  { id: "home.energy_rating", label: "Energy rating", defaultAudience: "public" },
  { id: "home.furnished", label: "Furnished", defaultAudience: "public" },
  { id: "home.pets_allowed", label: "Pets allowed", defaultAudience: "public" },
  { id: "home.price_hint_eur", label: "Price hint", defaultAudience: "public", match: true },
  { id: "home.legal_status", label: "Legal status", defaultAudience: "friends" },
]) as PublishableField[];

export interface HomePublishableLookup {
  snapshot: (recordId: string) => Record<string, string | number | boolean | null> | null;
  list: (filter?: { limit?: number }) => { recordId: string; label: string }[];
  subscribe?: (recordId: string, listener: PublishableUpdateListener) => () => void;
}

export function buildHomePublishableProvider(lookup: HomePublishableLookup): PublishableProvider {
  return {
    module: HOME_MODULE,
    publishableFields: () => [...HOME_PUBLISHABLE_FIELDS],
    getPublishableSnapshot: (recordId): PublishableSnapshot | null => {
      const fields = lookup.snapshot(recordId);
      if (!fields) return null;
      return { module: HOME_MODULE, recordId, takenAt: Math.floor(Date.now() / 1000), fields };
    },
    listPublishableRecords: (filter) => lookup.list(filter),
    onRecordUpdated: (recordId, listener) => {
      if (lookup.subscribe) return lookup.subscribe(recordId, listener);
      return () => undefined;
    },
  };
}
