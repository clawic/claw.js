// `profile-page/v1` — the owner's public "about" surface. One per Profile.

import type { CborValue } from "../../cbor.ts";
import type { MarketplaceVerticalPlugin } from "../plugin.ts";

export const PROFILE_PAGE_VERTICAL_ID = "profile-page/v1";

export interface ProfilePageBlock {
  display_name: string;
  about?: string;                  // markdown, ≤ 4KB
  pronouns?: string;
  links?: { label: string; url: string }[];
  avatar?: { hash: Uint8Array; mime: string; size: number };
  banner?: { hash: Uint8Array; mime: string; size: number };
  pinned_blocks?: Uint8Array[];    // up to 6 blockIds
  geo_zone?: string;
}

const PROFILE_PAGE_VISIBILITY: Record<string, string> = {
  display_name: "public",
  about: "public",
  pronouns: "public",
  links: "public",
  avatar: "public",
  banner: "public",
  pinned_blocks: "public",
  geo_zone: "public",
};

export function validateProfilePage(input: ProfilePageBlock): void {
  if (!input.display_name) throw new Error("profile-page: display_name required");
  if (input.display_name.length > 64) throw new Error("profile-page: display_name ≤ 64 chars");
  if (input.about && input.about.length > 4096) throw new Error("profile-page: about ≤ 4KB");
  if (input.links && input.links.length > 12) throw new Error("profile-page: links cap is 12");
  if (input.pinned_blocks && input.pinned_blocks.length > 6) throw new Error("profile-page: pinned_blocks cap is 6");
  if (input.geo_zone && input.geo_zone.length !== 4) throw new Error("profile-page: geo_zone must be 4-char geohash");
  for (const l of input.links ?? []) {
    if (!l.label || !l.url) throw new Error("profile-page: link must have label+url");
    if (l.label.length > 32) throw new Error("profile-page: link label ≤ 32 chars");
  }
}

export function profilePageToCbor(input: ProfilePageBlock): Record<string, CborValue> {
  validateProfilePage(input);
  const out: Record<string, CborValue> = { display_name: input.display_name };
  if (input.about) out.about = input.about;
  if (input.pronouns) out.pronouns = input.pronouns;
  if (input.links) out.links = input.links.map((l) => ({ label: l.label, url: l.url }));
  if (input.avatar) out.avatar = { hash: input.avatar.hash, mime: input.avatar.mime, size: input.avatar.size };
  if (input.banner) out.banner = { hash: input.banner.hash, mime: input.banner.mime, size: input.banner.size };
  if (input.pinned_blocks) out.pinned_blocks = input.pinned_blocks;
  if (input.geo_zone) out.geo_zone = input.geo_zone;
  return out;
}

export const profilePagePlugin: MarketplaceVerticalPlugin<ProfilePageBlock, ProfilePageBlock> = {
  id: PROFILE_PAGE_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: PROFILE_PAGE_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({ geoZone: fields.geo_zone as string | undefined }),
    want: ({ fields }) => ({ geoZone: fields.geo_zone as string | undefined }),
  },
  uiHints: { surface: "profile", preferredCard: "compact", primaryAction: "open", showsPhotos: true },
  validator: {
    validateOffer: validateProfilePage,
    validateWant: validateProfilePage,
    offerToCbor: profilePageToCbor,
    wantToCbor: profilePageToCbor,
  },
};
