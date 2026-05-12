// `album/v1` — list of photos with optional caption, optional geo. Standalone.

import type { CborValue } from "../../cbor.ts";
import type { MpVerticalPlugin } from "../plugin.ts";

export const ALBUM_VERTICAL_ID = "album/v1";

export interface AlbumPhoto { hash: Uint8Array; mime: string; size: number; caption?: string }

export interface AlbumBlock {
  title?: string;
  caption?: string;
  photos: AlbumPhoto[];
  geo_zone?: string;
  taken_at?: string;
}

const ALBUM_VISIBILITY: Record<string, string> = {
  title: "public",
  caption: "public",
  photos: "friends",   // by default photos are friends-only — owner can widen
  geo_zone: "public",
  taken_at: "public",
};

export function validateAlbum(input: AlbumBlock): void {
  if (!Array.isArray(input.photos) || input.photos.length === 0) {
    throw new Error("album: at least one photo required");
  }
  if (input.photos.length > 200) throw new Error("album: too many photos (cap 200)");
  if (input.title && input.title.length > 120) throw new Error("album: title too long");
  if (input.caption && input.caption.length > 4096) throw new Error("album: caption too long");
  if (input.geo_zone && input.geo_zone.length !== 4) throw new Error("album: geo_zone must be 4-char geohash");
}

export function albumToCbor(input: AlbumBlock): Record<string, CborValue> {
  validateAlbum(input);
  const out: Record<string, CborValue> = {
    photos: input.photos.map((p) => {
      const o: Record<string, CborValue> = { hash: p.hash, mime: p.mime, size: p.size };
      if (p.caption) o.caption = p.caption;
      return o;
    }),
  };
  if (input.title) out.title = input.title;
  if (input.caption) out.caption = input.caption;
  if (input.geo_zone) out.geo_zone = input.geo_zone;
  if (input.taken_at) out.taken_at = input.taken_at;
  return out;
}

export const albumPlugin: MpVerticalPlugin<AlbumBlock, AlbumBlock> = {
  id: ALBUM_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: ALBUM_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({ geoZone: fields.geo_zone as string | undefined }),
    want: ({ fields }) => ({ geoZone: fields.geo_zone as string | undefined }),
  },
  uiHints: { surface: "feed", preferredCard: "grid", primaryAction: "open", showsPhotos: true },
  validator: {
    validateOffer: validateAlbum,
    validateWant: validateAlbum,
    offerToCbor: albumToCbor,
    wantToCbor: albumToCbor,
  },
};
