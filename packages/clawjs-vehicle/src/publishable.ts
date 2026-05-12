// Publishable mapping for the `vehicle` tracking module.
//
// A `tracked-block` of vertical `vehicle/v1` (and/or `real-estate/v1` for
// vehicle-as-asset listings) can reference a vehicle record by its id and
// pull these fields out of the user's tracking observations.

import type {
  PublishableField, PublishableProvider, PublishableSnapshot, PublishableUpdateListener,
} from "@clawjs/tracking-runtime";

export const VEHICLE_MODULE = "vehicle" as const;

export const VEHICLE_PUBLISHABLE_FIELDS: PublishableField[] = Object.freeze([
  { id: "vehicle.make", label: "Make", defaultAudience: "public", match: true },
  { id: "vehicle.model", label: "Model", defaultAudience: "public", match: true },
  { id: "vehicle.year", label: "Year", defaultAudience: "public" },
  { id: "vehicle.km", label: "Kilometres", defaultAudience: "public" },
  { id: "vehicle.fuel_type", label: "Fuel type", defaultAudience: "public" },
  { id: "vehicle.color", label: "Color", defaultAudience: "public" },
  { id: "vehicle.vin_partial", label: "VIN (partial)", defaultAudience: "public" },
  { id: "vehicle.vin_full", label: "VIN (full)", defaultAudience: "inner-circle" },
  { id: "vehicle.last_service_at", label: "Last service date", defaultAudience: "friends" },
  { id: "vehicle.condition", label: "Condition", defaultAudience: "public" },
  { id: "vehicle.price_hint_eur", label: "Price hint (EUR)", defaultAudience: "public", match: true },
]) as PublishableField[];

export interface VehiclePublishableLookup {
  /** Resolve a record id to the current snapshot of publishable fields. */
  snapshot: (recordId: string) => Record<string, string | number | boolean | null> | null;
  /** List records the user could publish. */
  list: (filter?: { limit?: number }) => { recordId: string; label: string }[];
  /** Subscribe to live record updates. */
  subscribe?: (recordId: string, listener: PublishableUpdateListener) => () => void;
}

export function buildVehiclePublishableProvider(lookup: VehiclePublishableLookup): PublishableProvider {
  return {
    module: VEHICLE_MODULE,
    publishableFields: () => [...VEHICLE_PUBLISHABLE_FIELDS],
    getPublishableSnapshot: (recordId): PublishableSnapshot | null => {
      const fields = lookup.snapshot(recordId);
      if (!fields) return null;
      return {
        module: VEHICLE_MODULE,
        recordId,
        takenAt: Math.floor(Date.now() / 1000),
        fields,
      };
    },
    listPublishableRecords: (filter) => lookup.list(filter),
    onRecordUpdated: (recordId, listener) => {
      if (lookup.subscribe) return lookup.subscribe(recordId, listener);
      return () => undefined;
    },
  };
}
