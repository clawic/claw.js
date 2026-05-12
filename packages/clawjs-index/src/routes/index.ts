// Composite registration: `registerProfileSurfaces(app, deps)` plugs the
// whole Profile / Feed / Chat / Marketplace bundle into a Fastify app behind a
// single call.

import type { FastifyInstance } from "fastify";

import { registerProfileRoutes, type ProfileDeps } from "./profile.ts";
import { registerFeedRoutes, type FeedDeps } from "./feed.ts";
import { registerChatRoutes, type ChatDeps } from "./chats.ts";
import { registerMarketplaceRoutes, type MarketplaceDeps } from "./marketplace.ts";

export interface ProfileSurfaceDeps {
  profile: ProfileDeps;
  feed: FeedDeps;
  chats: ChatDeps;
  marketplace: MarketplaceDeps;
  /** Feature flag — when false, the routes are not mounted (preserving
   *  backward-compatible behaviour for installations still on mp/1.0.0). */
  enabled: boolean;
}

export const CLAWJS_PROFILE_FLAG_ENV = "CLAWJS_PROFILE_ENABLED";

export function profileFlagFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[CLAWJS_PROFILE_FLAG_ENV];
  if (raw === undefined) return false;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

export function registerProfileSurfaces(app: FastifyInstance, deps: ProfileSurfaceDeps): void {
  if (!deps.enabled) return;
  registerProfileRoutes(app, deps.profile);
  registerFeedRoutes(app, deps.feed);
  registerChatRoutes(app, deps.chats);
  registerMarketplaceRoutes(app, deps.marketplace);
}

export * from "./profile.ts";
export * from "./feed.ts";
export * from "./chats.ts";
export * from "./marketplace.ts";
