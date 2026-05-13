// `post/v1` — short-form text + optional attachments. Standalone, feed-shaped.

import type { CborValue } from "../../cbor.ts";
import type { MarketplaceVerticalPlugin } from "../plugin.ts";

export const POST_VERTICAL_ID = "post/v1";

export interface PostBlock {
  body: string;             // markdown, ≤ 8KB
  attachments?: { hash: Uint8Array; mime: string; size: number }[];
  reply_to?: Uint8Array;    // blockId being replied to
  repost_of?: Uint8Array;   // blockId being reposted
  tags?: string[];
}

const POST_VISIBILITY: Record<string, string> = {
  body: "public",
  attachments: "public",
  reply_to: "public",
  repost_of: "public",
  tags: "public",
};

export function validatePost(input: PostBlock): void {
  if (typeof input.body !== "string" || input.body.length === 0) {
    throw new Error("post: body required");
  }
  if (input.body.length > 8 * 1024) throw new Error("post: body must be ≤ 8KB");
  if (input.tags && input.tags.some((t) => t.length > 32)) {
    throw new Error("post: tags must each be ≤ 32 chars");
  }
}

export function postToCbor(input: PostBlock): Record<string, CborValue> {
  validatePost(input);
  const out: Record<string, CborValue> = { body: input.body };
  if (input.attachments) out.attachments = input.attachments.map((a) => ({ hash: a.hash, mime: a.mime, size: a.size }));
  if (input.reply_to) out.reply_to = input.reply_to;
  if (input.repost_of) out.repost_of = input.repost_of;
  if (input.tags) out.tags = input.tags;
  return out;
}

export const postPlugin: MarketplaceVerticalPlugin<PostBlock, PostBlock> = {
  id: POST_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: POST_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({ tag: (fields.tags as string[] | undefined)?.[0] }),
    want: ({ fields }) => ({ tag: (fields.tags as string[] | undefined)?.[0] }),
  },
  uiHints: { surface: "feed", preferredCard: "list", primaryAction: "open", showsPhotos: false },
  validator: {
    validateOffer: validatePost,
    validateWant: validatePost,
    offerToCbor: postToCbor,
    wantToCbor: postToCbor,
  },
};
