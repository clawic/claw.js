// Core verticals shipped inside `@clawjs/marketplace`. Plugin spec for domain plugins
// lives at `@clawjs/marketplace/verticals/plugin`.

import { VerticalRegistry, type MpVerticalPlugin } from "../plugin.ts";

import { postPlugin, POST_VERTICAL_ID } from "./post.ts";
import { hotTakePlugin, HOT_TAKE_VERTICAL_ID } from "./hot-take.ts";
import { albumPlugin, ALBUM_VERTICAL_ID } from "./album.ts";
import { itemPlugin, ITEM_VERTICAL_ID } from "./item.ts";
import { serviceOfferPlugin, SERVICE_OFFER_VERTICAL_ID } from "./service-offer.ts";
import { meetupPlugin, MEETUP_VERTICAL_ID } from "./meetup.ts";
import { profilePagePlugin, PROFILE_PAGE_VERTICAL_ID } from "./profile-page.ts";
import { wantPlugin, WANT_VERTICAL_ID } from "./want.ts";

export * from "./post.ts";
export * from "./hot-take.ts";
export * from "./album.ts";
export * from "./item.ts";
export * from "./service-offer.ts";
export * from "./meetup.ts";
export * from "./profile-page.ts";
export * from "./want.ts";

export const CORE_VERTICAL_PLUGINS: MpVerticalPlugin[] = [
  postPlugin as MpVerticalPlugin,
  hotTakePlugin as MpVerticalPlugin,
  albumPlugin as MpVerticalPlugin,
  itemPlugin as MpVerticalPlugin,
  serviceOfferPlugin as MpVerticalPlugin,
  meetupPlugin as MpVerticalPlugin,
  profilePagePlugin as MpVerticalPlugin,
  wantPlugin as MpVerticalPlugin,
];

export const CORE_VERTICAL_IDS: readonly string[] = Object.freeze([
  POST_VERTICAL_ID,
  HOT_TAKE_VERTICAL_ID,
  ALBUM_VERTICAL_ID,
  ITEM_VERTICAL_ID,
  SERVICE_OFFER_VERTICAL_ID,
  MEETUP_VERTICAL_ID,
  PROFILE_PAGE_VERTICAL_ID,
  WANT_VERTICAL_ID,
]);

export function buildCoreRegistry(): VerticalRegistry {
  const registry = new VerticalRegistry();
  for (const plugin of CORE_VERTICAL_PLUGINS) registry.register(plugin);
  return registry;
}
