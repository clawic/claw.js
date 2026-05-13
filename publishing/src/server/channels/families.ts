// Static catalog of all channel families. Each is a CapabilityDescriptor +
// metadata. Concrete adapters override the skeleton in the registry.

import type {
  CapabilityDescriptor,
  ChannelAuthKind,
  ChannelFamilyDescriptor,
  ChannelGroup,
  ContentKind,
} from "../../shared/types.ts";

interface FamilyShorthand {
  id: string;
  name: string;
  group: ChannelGroup;
  authKind: ChannelAuthKind;
  contentKinds: ContentKind[];
  maxChars: number;
  photo?: { max: number; maxBytes: number };
  video?: { maxBytes: number; maxDurationMs: number; aspectRatios?: string[] };
  thread?: { maxBlocks: number };
  nativeScheduling?: boolean;
  firstComment?: boolean;
  multiVariant?: "never" | "per_account" | "per_locale" | "both";
  audienceTargeting?: boolean;
  options?: Record<string, { kind: "string" | "number" | "boolean" | "enum" | "object" | "array"; enum?: string[] }>;
  dailyPosts?: number;
}

function build(shorthand: FamilyShorthand): ChannelFamilyDescriptor {
  const caps: CapabilityDescriptor = {
    contentKinds: shorthand.contentKinds,
    text: {
      maxChars: shorthand.maxChars,
      supportsMarkdown: shorthand.group === "long_form" || shorthand.group === "chat" || shorthand.group === "email" || shorthand.group === "dev",
      supportsMentions: shorthand.group === "social" || shorthand.group === "chat" || shorthand.group === "forum" || shorthand.group === "forum_federated",
      supportsHashtags: shorthand.group === "social" || shorthand.group === "forum_federated",
    },
    media: {
      mixedAllowed: shorthand.group !== "feed" && shorthand.group !== "generic",
      ...(shorthand.photo
        ? {
            photo: {
              min: 0,
              max: shorthand.photo.max,
              mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
              maxBytes: shorthand.photo.maxBytes,
            },
          }
        : {}),
      ...(shorthand.video
        ? {
            video: {
              min: 0,
              max: 1,
              mimeTypes: ["video/mp4", "video/quicktime"],
              maxBytes: shorthand.video.maxBytes,
              maxDurationMs: shorthand.video.maxDurationMs,
              aspectRatios: shorthand.video.aspectRatios,
            },
          }
        : {}),
    },
    thread: shorthand.thread
      ? { supported: true, maxBlocks: shorthand.thread.maxBlocks }
      : { supported: false },
    scheduling: {
      nativeSchedulingSupported: !!shorthand.nativeScheduling,
      queueSupported: true,
    },
    options: shorthand.options ?? {},
    rateLimit: shorthand.dailyPosts
      ? { dailyPosts: shorthand.dailyPosts, hint: "per_account" }
      : { hint: "unknown" },
    multiVariant: shorthand.multiVariant ?? "per_account",
    audienceTargeting: !!shorthand.audienceTargeting,
    firstComment: !!shorthand.firstComment,
    geo: { tagSupported: shorthand.group === "social", named: true, coords: true },
    deletion: { byProviderPostId: true },
    attribution: { utmAllowed: true, linkInPostBody: true, linkInBio: shorthand.group === "social" },
  };
  return {
    id: shorthand.id,
    name: shorthand.name,
    group: shorthand.group,
    authKind: shorthand.authKind,
    capabilities: caps,
    capabilitySchemaVersion: 1,
  };
}

export const FAMILIES: ChannelFamilyDescriptor[] = [
  // ── Test / placeholder ─────────────────────────────────────────────────
  build({
    id: "devnull",
    name: "Dev Null (test)",
    group: "generic",
    authKind: "none",
    contentKinds: ["text", "photo", "video", "thread", "link_card", "poll"],
    maxChars: 100000,
    thread: { maxBlocks: 100 },
    nativeScheduling: true,
    firstComment: true,
  }),

  // ── Social ─────────────────────────────────────────────────────────────
  build({
    id: "x",
    name: "X",
    group: "social",
    authKind: "oauth1a",
    contentKinds: ["text", "photo", "video", "gif", "thread", "poll"],
    maxChars: 280,
    photo: { max: 4, maxBytes: 5 * 1024 * 1024 },
    video: { maxBytes: 512 * 1024 * 1024, maxDurationMs: 140_000 },
    thread: { maxBlocks: 25 },
    nativeScheduling: false,
    dailyPosts: 100,
  }),
  build({
    id: "mastodon",
    name: "Mastodon",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "gif", "thread", "poll"],
    maxChars: 500,
    photo: { max: 4, maxBytes: 8 * 1024 * 1024 },
    video: { maxBytes: 40 * 1024 * 1024, maxDurationMs: 60_000 },
    thread: { maxBlocks: 25 },
    nativeScheduling: true,
    options: { visibility: { kind: "enum", enum: ["public", "unlisted", "private", "direct"] }, sensitive: { kind: "boolean" } },
  }),
  build({
    id: "bluesky",
    name: "Bluesky",
    group: "social",
    authKind: "app_password",
    contentKinds: ["text", "photo", "video", "thread"],
    maxChars: 300,
    photo: { max: 4, maxBytes: 1 * 1024 * 1024 },
    video: { maxBytes: 100 * 1024 * 1024, maxDurationMs: 60_000 },
    thread: { maxBlocks: 25 },
    nativeScheduling: false,
  }),
  build({
    id: "facebook_page",
    name: "Facebook Page",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "reel", "story", "link_card"],
    maxChars: 63206,
    photo: { max: 10, maxBytes: 10 * 1024 * 1024 },
    video: { maxBytes: 4 * 1024 * 1024 * 1024, maxDurationMs: 240 * 60 * 1000 },
    nativeScheduling: true,
    firstComment: true,
    audienceTargeting: true,
  }),
  build({
    id: "facebook_group",
    name: "Facebook Group",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "link_card"],
    maxChars: 63206,
    photo: { max: 10, maxBytes: 10 * 1024 * 1024 },
    nativeScheduling: false,
  }),
  build({
    id: "instagram",
    name: "Instagram",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["photo", "carousel", "video", "reel", "story"],
    maxChars: 2200,
    photo: { max: 10, maxBytes: 30 * 1024 * 1024 },
    video: { maxBytes: 1 * 1024 * 1024 * 1024, maxDurationMs: 90_000, aspectRatios: ["9:16", "1:1", "4:5"] },
    nativeScheduling: true,
    firstComment: true,
  }),
  build({
    id: "threads",
    name: "Threads",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "thread"],
    maxChars: 500,
    photo: { max: 10, maxBytes: 8 * 1024 * 1024 },
    video: { maxBytes: 1 * 1024 * 1024 * 1024, maxDurationMs: 5 * 60 * 1000 },
    thread: { maxBlocks: 25 },
  }),
  build({
    id: "linkedin_profile",
    name: "LinkedIn (profile)",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "document", "poll", "link_card"],
    maxChars: 3000,
    photo: { max: 20, maxBytes: 100 * 1024 * 1024 },
    video: { maxBytes: 5 * 1024 * 1024 * 1024, maxDurationMs: 30 * 60 * 1000 },
    audienceTargeting: true,
  }),
  build({
    id: "linkedin_org",
    name: "LinkedIn (organization)",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "document", "poll", "link_card"],
    maxChars: 3000,
    photo: { max: 20, maxBytes: 100 * 1024 * 1024 },
    video: { maxBytes: 5 * 1024 * 1024 * 1024, maxDurationMs: 30 * 60 * 1000 },
    audienceTargeting: true,
    nativeScheduling: true,
  }),
  build({
    id: "tiktok",
    name: "TikTok",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["video"],
    maxChars: 2200,
    video: { maxBytes: 4 * 1024 * 1024 * 1024, maxDurationMs: 10 * 60 * 1000, aspectRatios: ["9:16"] },
    options: {
      privacy_level: { kind: "enum", enum: ["public_to_everyone", "mutual_follow_friends", "self_only"] },
      allow_comments: { kind: "boolean" },
      allow_duet: { kind: "boolean" },
      allow_stitch: { kind: "boolean" },
      branded_content: { kind: "boolean" },
      your_brand: { kind: "boolean" },
      disclosure: { kind: "boolean" },
    },
  }),
  build({
    id: "youtube",
    name: "YouTube",
    group: "video",
    authKind: "oauth2",
    contentKinds: ["video"],
    maxChars: 5000,
    video: { maxBytes: 256 * 1024 * 1024 * 1024, maxDurationMs: 12 * 60 * 60 * 1000 },
    nativeScheduling: true,
    options: {
      title: { kind: "string" },
      description: { kind: "string" },
      tags: { kind: "array" },
      category_id: { kind: "string" },
      made_for_kids: { kind: "boolean" },
      status: { kind: "enum", enum: ["public", "unlisted", "private"] },
    },
  }),
  build({
    id: "youtube_short",
    name: "YouTube Short",
    group: "video",
    authKind: "oauth2",
    contentKinds: ["short"],
    maxChars: 1000,
    video: { maxBytes: 256 * 1024 * 1024 * 1024, maxDurationMs: 60 * 1000, aspectRatios: ["9:16"] },
    nativeScheduling: true,
  }),
  build({
    id: "pinterest",
    name: "Pinterest",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["photo", "video"],
    maxChars: 500,
    photo: { max: 1, maxBytes: 20 * 1024 * 1024 },
    video: { maxBytes: 2 * 1024 * 1024 * 1024, maxDurationMs: 15 * 60 * 1000 },
    options: { boards: { kind: "object" } },
  }),
  build({
    id: "gbp",
    name: "Google Business Profile",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video"],
    maxChars: 1500,
    photo: { max: 10, maxBytes: 5 * 1024 * 1024 },
    options: {
      post_kind: { kind: "enum", enum: ["text", "photo", "event", "offer"] },
      event: { kind: "object" },
      offer: { kind: "object" },
      button: { kind: "object" },
    },
  }),

  // ── Federated / niche ──────────────────────────────────────────────────
  build({
    id: "pixelfed",
    name: "Pixelfed",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["photo", "carousel"],
    maxChars: 500,
    photo: { max: 10, maxBytes: 8 * 1024 * 1024 },
  }),
  build({
    id: "lemmy",
    name: "Lemmy",
    group: "forum_federated",
    authKind: "oauth2",
    contentKinds: ["text", "link_card", "photo"],
    maxChars: 10000,
  }),
  build({
    id: "misskey",
    name: "Misskey",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "thread"],
    maxChars: 3000,
    photo: { max: 16, maxBytes: 100 * 1024 * 1024 },
    thread: { maxBlocks: 50 },
  }),
  build({
    id: "tumblr",
    name: "Tumblr",
    group: "social",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "audio", "link_card"],
    maxChars: 10000,
    photo: { max: 10, maxBytes: 10 * 1024 * 1024 },
  }),
  build({
    id: "nostr",
    name: "Nostr",
    group: "social",
    authKind: "bearer_static",
    contentKinds: ["text"],
    maxChars: 100000,
  }),

  // ── Long-form ──────────────────────────────────────────────────────────
  build({
    id: "wordpress",
    name: "WordPress",
    group: "long_form",
    authKind: "oauth2",
    contentKinds: ["text", "photo"],
    maxChars: 100000,
    photo: { max: 50, maxBytes: 50 * 1024 * 1024 },
    options: { long_form: { kind: "object" } },
  }),
  build({
    id: "substack",
    name: "Substack",
    group: "long_form",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 100000,
    options: { long_form: { kind: "object" } },
  }),
  build({
    id: "ghost",
    name: "Ghost",
    group: "long_form",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
    options: { long_form: { kind: "object" } },
  }),
  build({
    id: "medium",
    name: "Medium",
    group: "long_form",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 100000,
  }),
  build({
    id: "devto",
    name: "dev.to",
    group: "dev",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
  }),
  build({
    id: "hashnode",
    name: "Hashnode",
    group: "long_form",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
  }),

  // ── Forums ─────────────────────────────────────────────────────────────
  build({
    id: "reddit",
    name: "Reddit",
    group: "forum",
    authKind: "oauth2",
    contentKinds: ["text", "link_card", "photo", "video"],
    maxChars: 40000,
    photo: { max: 20, maxBytes: 20 * 1024 * 1024 },
    video: { maxBytes: 1 * 1024 * 1024 * 1024, maxDurationMs: 15 * 60 * 1000 },
    options: { forum: { kind: "object" } },
  }),
  build({
    id: "hackernews",
    name: "Hacker News",
    group: "forum",
    authKind: "basic",
    contentKinds: ["text", "link_card"],
    maxChars: 80000,
  }),
  build({
    id: "lobsters",
    name: "Lobsters",
    group: "forum",
    authKind: "basic",
    contentKinds: ["text", "link_card"],
    maxChars: 80000,
  }),

  // ── Chat / messaging ───────────────────────────────────────────────────
  build({
    id: "discord",
    name: "Discord",
    group: "chat",
    authKind: "webhook_signed",
    contentKinds: ["text", "photo", "video", "audio", "document"],
    maxChars: 2000,
    photo: { max: 10, maxBytes: 25 * 1024 * 1024 },
    options: { chat: { kind: "object" } },
  }),
  build({
    id: "telegram",
    name: "Telegram",
    group: "chat",
    authKind: "bearer_static",
    contentKinds: ["text", "photo", "video", "audio", "document"],
    maxChars: 4096,
    photo: { max: 10, maxBytes: 10 * 1024 * 1024 },
    video: { maxBytes: 2 * 1024 * 1024 * 1024, maxDurationMs: 60 * 60 * 1000 },
  }),
  build({
    id: "slack",
    name: "Slack",
    group: "chat",
    authKind: "oauth2",
    contentKinds: ["text", "photo", "video", "document"],
    maxChars: 40000,
    photo: { max: 10, maxBytes: 1 * 1024 * 1024 * 1024 },
    options: { chat: { kind: "object" } },
  }),
  build({
    id: "whatsapp_business",
    name: "WhatsApp Business",
    group: "chat",
    authKind: "bearer_static",
    contentKinds: ["text", "photo", "video", "document"],
    maxChars: 4096,
    photo: { max: 1, maxBytes: 5 * 1024 * 1024 },
  }),

  // ── Feeds ──────────────────────────────────────────────────────────────
  build({
    id: "rss_feed",
    name: "RSS Feed (self-hosted)",
    group: "feed",
    authKind: "none",
    contentKinds: ["text", "link_card", "photo"],
    maxChars: 100000,
    options: { rss: { kind: "object" } },
  }),
  build({
    id: "json_feed",
    name: "JSON Feed (self-hosted)",
    group: "feed",
    authKind: "none",
    contentKinds: ["text", "link_card", "photo"],
    maxChars: 100000,
  }),
  build({
    id: "atom_feed",
    name: "ATOM (self-hosted)",
    group: "feed",
    authKind: "none",
    contentKinds: ["text", "link_card", "photo"],
    maxChars: 100000,
  }),

  // ── Email ──────────────────────────────────────────────────────────────
  build({
    id: "smtp",
    name: "SMTP (generic)",
    group: "email",
    authKind: "basic",
    contentKinds: ["text"],
    maxChars: 100000,
    options: { email: { kind: "object" } },
  }),
  build({
    id: "convertkit",
    name: "ConvertKit",
    group: "email",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
    options: { email: { kind: "object" } },
  }),
  build({
    id: "mailchimp",
    name: "Mailchimp",
    group: "email",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 100000,
    options: { email: { kind: "object" } },
  }),
  build({
    id: "klaviyo",
    name: "Klaviyo",
    group: "email",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
  }),
  build({
    id: "buttondown",
    name: "Buttondown",
    group: "email",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
  }),
  build({
    id: "emailoctopus",
    name: "EmailOctopus",
    group: "email",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
  }),
  build({
    id: "beehiiv",
    name: "Beehiiv",
    group: "email",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 100000,
  }),

  // ── Video / audio ──────────────────────────────────────────────────────
  build({
    id: "vimeo",
    name: "Vimeo",
    group: "video",
    authKind: "oauth2",
    contentKinds: ["video"],
    maxChars: 5000,
    video: { maxBytes: 256 * 1024 * 1024 * 1024, maxDurationMs: 12 * 60 * 60 * 1000 },
  }),
  build({
    id: "twitch",
    name: "Twitch (schedule)",
    group: "video",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 200,
  }),
  build({
    id: "spotify_podcasters",
    name: "Spotify for Podcasters",
    group: "audio",
    authKind: "oauth2",
    contentKinds: ["audio"],
    maxChars: 4000,
  }),
  build({
    id: "castos",
    name: "Castos",
    group: "audio",
    authKind: "api_key",
    contentKinds: ["audio"],
    maxChars: 4000,
  }),
  build({
    id: "transistor",
    name: "Transistor",
    group: "audio",
    authKind: "api_key",
    contentKinds: ["audio"],
    maxChars: 4000,
  }),

  // ── Events ─────────────────────────────────────────────────────────────
  build({
    id: "lu_ma",
    name: "Lu.ma",
    group: "event",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 5000,
    options: { event: { kind: "object" } },
  }),
  build({
    id: "eventbrite",
    name: "Eventbrite",
    group: "event",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 5000,
    options: { event: { kind: "object" } },
  }),
  build({
    id: "meetup",
    name: "Meetup",
    group: "event",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 5000,
    options: { event: { kind: "object" } },
  }),

  // ── Dev / docs ─────────────────────────────────────────────────────────
  build({
    id: "github_release",
    name: "GitHub Release",
    group: "dev",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 125000,
  }),
  build({
    id: "github_discussion",
    name: "GitHub Discussion",
    group: "dev",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 65000,
  }),
  build({
    id: "gitlab_announcement",
    name: "GitLab Announcement",
    group: "dev",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 65000,
  }),
  build({
    id: "notion_page",
    name: "Notion Page",
    group: "doc",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 100000,
  }),
  build({
    id: "confluence_page",
    name: "Confluence Page",
    group: "doc",
    authKind: "oauth2",
    contentKinds: ["text"],
    maxChars: 100000,
  }),

  // ── Generic outputs ────────────────────────────────────────────────────
  build({
    id: "webhook_outbound",
    name: "Outbound Webhook",
    group: "generic",
    authKind: "webhook_signed",
    contentKinds: ["text"],
    maxChars: 1_000_000,
  }),
  build({
    id: "push_notification",
    name: "Push Notification",
    group: "generic",
    authKind: "api_key",
    contentKinds: ["text"],
    maxChars: 4000,
    options: { push: { kind: "object" } },
  }),
  build({
    id: "twilio_sms",
    name: "Twilio SMS",
    group: "generic",
    authKind: "basic",
    contentKinds: ["text"],
    maxChars: 1600,
  }),
];

export function familyMap(): Map<string, ChannelFamilyDescriptor> {
  const map = new Map<string, ChannelFamilyDescriptor>();
  for (const f of FAMILIES) map.set(f.id, f);
  return map;
}
