// `meetup/v1` — a real-world meetup announcement. Standalone.

import type { CborValue } from "../../cbor.ts";
import type { MpVerticalPlugin } from "../plugin.ts";

export const MEETUP_VERTICAL_ID = "meetup/v1";

export type ActivityKind = "sport" | "study" | "hobby" | "music" | "food" | "social" | "professional" | "other";

export interface MeetupBlock {
  title: string;
  description?: string;
  starts_at: string;             // ISO-8601
  ends_at?: string;
  recurring?: "daily" | "weekly" | "monthly" | "none";
  geo_zone: string;              // 4-char geohash
  venue_hint?: string;           // human label, no exact address
  venue_exact?: string;          // revealed at audience level
  capacity?: number;
  activity_kind: ActivityKind;
  sport?: string;                // e.g. "basketball-3v3"
  contact_handle?: string;
}

const MEETUP_VISIBILITY: Record<string, string> = {
  title: "public",
  description: "public",
  starts_at: "public",
  ends_at: "public",
  recurring: "public",
  geo_zone: "public",
  venue_hint: "public",
  venue_exact: "audience",
  capacity: "public",
  activity_kind: "public",
  sport: "public",
  contact_handle: "public",
};

export function validateMeetup(input: MeetupBlock): void {
  if (!input.title) throw new Error("meetup: title required");
  if (input.title.length > 120) throw new Error("meetup: title ≤ 120 chars");
  if (!input.starts_at || Number.isNaN(Date.parse(input.starts_at))) throw new Error("meetup: starts_at must be ISO-8601");
  if (input.ends_at && Number.isNaN(Date.parse(input.ends_at))) throw new Error("meetup: ends_at must be ISO-8601");
  if (!input.geo_zone || input.geo_zone.length !== 4) throw new Error("meetup: geo_zone must be 4-char geohash");
  if (!input.activity_kind) throw new Error("meetup: activity_kind required");
  if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    throw new Error("meetup: capacity must be a positive integer");
  }
}

export function meetupToCbor(input: MeetupBlock): Record<string, CborValue> {
  validateMeetup(input);
  const out: Record<string, CborValue> = {
    title: input.title,
    starts_at: input.starts_at,
    geo_zone: input.geo_zone,
    activity_kind: input.activity_kind,
  };
  if (input.description) out.description = input.description;
  if (input.ends_at) out.ends_at = input.ends_at;
  if (input.recurring) out.recurring = input.recurring;
  if (input.venue_hint) out.venue_hint = input.venue_hint;
  if (input.venue_exact) out.venue_exact = input.venue_exact;
  if (input.capacity !== undefined) out.capacity = input.capacity;
  if (input.sport) out.sport = input.sport;
  if (input.contact_handle) out.contact_handle = input.contact_handle;
  return out;
}

export const meetupPlugin: MpVerticalPlugin<MeetupBlock, MeetupBlock> = {
  id: MEETUP_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: MEETUP_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: (fields.sport as string | undefined) ?? (fields.activity_kind as string | undefined),
    }),
    want: ({ fields }) => ({
      geoZone: fields.geo_zone as string | undefined,
      tag: (fields.sport as string | undefined) ?? (fields.activity_kind as string | undefined),
    }),
  },
  uiHints: { surface: "marketplace", preferredCard: "map-pin", primaryAction: "rsvp", showsPhotos: false },
  validator: {
    validateOffer: validateMeetup,
    validateWant: validateMeetup,
    offerToCbor: meetupToCbor,
    wantToCbor: meetupToCbor,
  },
};
