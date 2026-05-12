// Publishable mapping for the `possessions` tracking module.
//
// A possession (book, kitchen mixer, drone, ...) maps naturally to the
// `item/v1` vertical when the owner wants to sell, lend or swap it. The
// `archetype` here is `tracked` because the canonical record lives in
// `clawjs-possessions`; the Profile block just overlays commerce intent.

import type {
  PublishableField, PublishableProvider, PublishableSnapshot, PublishableUpdateListener,
} from "@clawjs/tracking-runtime";

export const POSSESSIONS_MODULE = "possessions" as const;

export const POSSESSIONS_PUBLISHABLE_FIELDS: PublishableField[] = Object.freeze([
  { id: "possessions.title", label: "Title", defaultAudience: "public", match: true },
  { id: "possessions.category", label: "Category", defaultAudience: "public", match: true },
  { id: "possessions.condition", label: "Condition", defaultAudience: "public" },
  { id: "possessions.brand", label: "Brand", defaultAudience: "public" },
  { id: "possessions.model", label: "Model", defaultAudience: "public" },
  { id: "possessions.acquired_at", label: "Acquired at", defaultAudience: "friends" },
  { id: "possessions.acquired_price_eur", label: "Acquired price (EUR)", defaultAudience: "friends" },
  { id: "possessions.serial_number", label: "Serial number", defaultAudience: "inner-circle" },
  { id: "possessions.notes", label: "Notes", defaultAudience: "friends" },
  { id: "possessions.geo_zone", label: "Neighbourhood", defaultAudience: "public" },
]) as PublishableField[];

export interface PossessionsPublishableLookup {
  snapshot: (recordId: string) => Record<string, string | number | boolean | null> | null;
  list: (filter?: { limit?: number }) => { recordId: string; label: string }[];
  subscribe?: (recordId: string, listener: PublishableUpdateListener) => () => void;
}

export function buildPossessionsPublishableProvider(lookup: PossessionsPublishableLookup): PublishableProvider {
  return {
    module: POSSESSIONS_MODULE,
    publishableFields: () => [...POSSESSIONS_PUBLISHABLE_FIELDS],
    getPublishableSnapshot: (recordId): PublishableSnapshot | null => {
      const fields = lookup.snapshot(recordId);
      if (!fields) return null;
      return { module: POSSESSIONS_MODULE, recordId, takenAt: Math.floor(Date.now() / 1000), fields };
    },
    listPublishableRecords: (filter) => lookup.list(filter),
    onRecordUpdated: (recordId, listener) => {
      if (lookup.subscribe) return lookup.subscribe(recordId, listener);
      return () => undefined;
    },
  };
}
