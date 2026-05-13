// `hot-take/v1` — short opinion text with mood/tag. Standalone, feed-shaped.

import type { CborValue } from "../../cbor.ts";
import type { MarketplaceVerticalPlugin } from "../plugin.ts";

export const HOT_TAKE_VERTICAL_ID = "hot-take/v1";

export type Mood = "spicy" | "controversial" | "shower-thought" | "rant" | "praise";

export interface HotTakeBlock {
  text: string;               // ≤ 280 chars
  tags?: string[];
  mood?: Mood;
}

const HOT_TAKE_VISIBILITY: Record<string, string> = {
  text: "public",
  tags: "public",
  mood: "public",
};

export function validateHotTake(input: HotTakeBlock): void {
  if (typeof input.text !== "string" || input.text.length === 0) throw new Error("hot-take: text required");
  if (input.text.length > 280) throw new Error("hot-take: text must be ≤ 280 chars");
}

export function hotTakeToCbor(input: HotTakeBlock): Record<string, CborValue> {
  validateHotTake(input);
  const out: Record<string, CborValue> = { text: input.text };
  if (input.tags) out.tags = input.tags;
  if (input.mood) out.mood = input.mood;
  return out;
}

export const hotTakePlugin: MarketplaceVerticalPlugin<HotTakeBlock, HotTakeBlock> = {
  id: HOT_TAKE_VERTICAL_ID,
  archetype: "standalone",
  defaultVisibility: HOT_TAKE_VISIBILITY,
  matchExtractors: {
    offer: ({ fields }) => ({ tag: (fields.mood as string | undefined) ?? (fields.tags as string[] | undefined)?.[0] }),
    want: ({ fields }) => ({ tag: (fields.mood as string | undefined) ?? (fields.tags as string[] | undefined)?.[0] }),
  },
  uiHints: { surface: "feed", preferredCard: "list", primaryAction: "open", showsPhotos: false },
  validator: {
    validateOffer: validateHotTake,
    validateWant: validateHotTake,
    offerToCbor: hotTakeToCbor,
    wantToCbor: hotTakeToCbor,
  },
};
