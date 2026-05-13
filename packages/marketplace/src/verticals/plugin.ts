// Stable contract for marketplace vertical plugins.
//
// A vertical plugin packages: a schema, default per-field visibility levels,
// match extractors (which fields feed the discoveryKey), and UI hints (which
// special surfaces the apps should render: map, swipe, gallery, etc.).
//
// Built-in core verticals (post / hot-take / album / item / service-offer /
// meetup / profile-page / want) ship inside `@clawjs/marketplace/verticals/core`.
// Domain plugins ship as their own npm packages (`@clawjs/marketplace-real-estate`,
// `@clawjs/marketplace-vehicle`, `@clawjs/marketplace-dating`, ...).

import type { CborValue } from "../cbor.ts";

export type VerticalArchetype = "tracked" | "standalone" | "both";

export interface UiHints {
  surface?: "feed" | "marketplace" | "swipe" | "map" | "messages" | "profile";
  preferredCard?: "compact" | "grid" | "story" | "list" | "swipe-stack" | "map-pin";
  primaryAction?: "open" | "message" | "interested" | "rsvp" | "swipe";
  showsPhotos?: boolean;
  acceptsCustomFields?: boolean;
}

export interface MatchExtractorInput {
  fields: Record<string, CborValue>;
}

export interface MatchExtractors {
  /** Returns the (vertical, geoZone, tag, priceBand) used to compute the offer's discoveryKey. */
  offer: (input: MatchExtractorInput) => { geoZone?: string; tag?: string; priceBand?: number };
  /** Same as `offer` but for the seeker side; usually identical. */
  want: (input: MatchExtractorInput) => { geoZone?: string; tag?: string; priceBand?: number };
}

/** Plugins ship their schema as a thin validator. We don't bind to Zod at
 * this layer so plugins can pick their own validator. */
export interface VerticalValidator<TOffer = unknown, TWant = TOffer> {
  validateOffer: (input: TOffer) => void;
  validateWant: (input: TWant) => void;
  offerToCbor: (input: TOffer) => Record<string, CborValue>;
  wantToCbor: (input: TWant) => Record<string, CborValue>;
}

export interface MpVerticalPlugin<TOffer = unknown, TWant = TOffer> {
  id: string;                       // e.g. "real-estate/v1", "post/v1"
  archetype: VerticalArchetype;
  /** Default per-field minimum audience level (string id, e.g. "public"). */
  defaultVisibility: Record<string, string>;
  matchExtractors: MatchExtractors;
  uiHints?: UiHints;
  validator: VerticalValidator<TOffer, TWant>;
}

/** A registry of plugins, keyed by their `id`. */
export class VerticalRegistry {
  private readonly entries = new Map<string, MpVerticalPlugin>();

  register<O, W>(plugin: MpVerticalPlugin<O, W>): void {
    if (this.entries.has(plugin.id)) {
      throw new Error(`vertical-registry: "${plugin.id}" already registered`);
    }
    this.entries.set(plugin.id, plugin as MpVerticalPlugin);
  }

  get(id: string): MpVerticalPlugin | undefined { return this.entries.get(id); }

  has(id: string): boolean { return this.entries.has(id); }

  list(): MpVerticalPlugin[] { return Array.from(this.entries.values()); }

  ids(): string[] { return Array.from(this.entries.keys()); }
}
