// Publishable record bridge between tracking modules and the Profile namespace.
//
// Any tracking module (vehicle, home, possessions, career, ...) can implement
// the `PublishableProvider` interface so the Clawix Profile layer can mint a
// `tracked-block` that points back at a specific record + the public subset of
// its fields. The Profile daemon then watches for record updates and bumps the
// block's version so subscribers see fresh state.
//
// This interface lives in `tracking-runtime` so any module can ship its own
// `publishable.ts` without taking a hard dependency on `@clawjs/profile`.

import type { Observation } from "@clawjs/tracking-core";

export interface PublishableField {
  /** Stable id, e.g. "vehicle.make", "home.surface_m2". */
  id: string;
  /** Display label for UI listings. */
  label: string;
  /** Default audience level. */
  defaultAudience: "public" | "audience" | "friends" | "family" | "inner-circle";
  /** True when this field should feed the discoveryKey (match extractor). */
  match?: boolean;
}

export interface PublishableSnapshot {
  module: string;             // e.g. "vehicle"
  recordId: string;           // local record id
  takenAt: number;            // epoch seconds
  fields: Record<string, string | number | boolean | null>;
  /** Optional 32-byte hash (blake3) of the canonical snapshot bytes. */
  snapshotHash?: Uint8Array;
}

export type PublishableUpdateListener = (snapshot: PublishableSnapshot) => void;

/**
 * The contract a tracking module exposes to the Profile daemon.
 *
 * `getPublishableSnapshot` is called when a Block is created/refreshed.
 * `onRecordUpdated` lets the Profile daemon subscribe to live record updates
 * so it can bump block versions and republish.
 */
export interface PublishableProvider {
  /** Stable module identifier ("vehicle", "home", "possessions", ...). */
  module: string;

  /** Field catalog this module is willing to expose. */
  publishableFields(): PublishableField[];

  /** Resolve a single record to its publishable snapshot. */
  getPublishableSnapshot(recordId: string): PublishableSnapshot | null;

  /** List candidate records the user could turn into a Block. */
  listPublishableRecords(filter?: { limit?: number }): { recordId: string; label: string }[];

  /** Subscribe to record updates. Returns an unsubscribe function. */
  onRecordUpdated(recordId: string, listener: PublishableUpdateListener): () => void;
}

// ---- registry ----

export class PublishableRegistry {
  private readonly providers = new Map<string, PublishableProvider>();

  register(provider: PublishableProvider): void {
    if (this.providers.has(provider.module)) {
      throw new Error(`publishable: provider for "${provider.module}" already registered`);
    }
    this.providers.set(provider.module, provider);
  }

  get(module: string): PublishableProvider | undefined { return this.providers.get(module); }

  has(module: string): boolean { return this.providers.has(module); }

  list(): PublishableProvider[] { return [...this.providers.values()]; }

  modules(): string[] { return [...this.providers.keys()]; }
}

// ---- helpers for tracking modules ----

/**
 * Build a `PublishableSnapshot` from the most recent observation per variable
 * the module declared as publishable.
 *
 * Most tracking modules store typed observations through the shared
 * `tracking-runtime` store. This helper turns a list of latest-per-variable
 * observations into the simple key/value shape Profile needs.
 */
export function snapshotFromObservations(input: {
  module: string;
  recordId: string;
  observations: Observation[];
  variableLabel: (variableId: string) => string;
}): PublishableSnapshot {
  const fields: Record<string, string | number | boolean | null> = {};
  for (const obs of input.observations) {
    const id = `${input.module}.${input.variableLabel(obs.variableId)}`;
    fields[id] = observationToScalar(obs);
  }
  return {
    module: input.module,
    recordId: input.recordId,
    takenAt: Math.floor(Date.now() / 1000),
    fields,
  };
}

function observationToScalar(obs: Observation): string | number | boolean | null {
  const v = obs.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  // Compound values (GeoValue, PhotoValue) get folded into a stable string repr.
  // Profile blocks that need the structured form should pull from the tracked
  // record directly via its own client, not via the snapshot scalar shape.
  return JSON.stringify(v);
}
