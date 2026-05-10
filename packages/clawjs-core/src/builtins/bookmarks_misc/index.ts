import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BOOKMARKS } from "./bookmarks.ts";
import { BOOKMARK_COLLECTIONS } from "./bookmark_collections.ts";
import { SNIPPETS } from "./snippets.ts";
import { SAVED_QUOTES } from "./saved_quotes.ts";
import { VOICE_MEMOS } from "./voice_memos.ts";
import { PERSONAL_NOTES } from "./personal_notes.ts";

export const BOOKMARKS_MISC_FAMILY: BuiltinFamilyDefinition = {
  name: "bookmarks_misc",
  displayName: "Bookmarks & Misc",
  description: "Bookmarks, snippets, quotes, voice memos, personal notes.",
  collections: [BOOKMARKS, BOOKMARK_COLLECTIONS, SNIPPETS, SAVED_QUOTES, VOICE_MEMOS, PERSONAL_NOTES],
};

export { BOOKMARKS, BOOKMARK_COLLECTIONS, SNIPPETS, SAVED_QUOTES, VOICE_MEMOS, PERSONAL_NOTES };
