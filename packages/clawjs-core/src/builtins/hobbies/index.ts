import type { BuiltinFamilyDefinition } from "../_types.ts";
import { COLLECTIBLE_ITEMS } from "./collectible_items.ts";
import { COLLECTION_GROUPS } from "./collection_groups.ts";
import { WISHLISTS } from "./wishlists.ts";
import { WISHLIST_ITEMS } from "./wishlist_items.ts";
import { BOARD_GAMES } from "./board_games.ts";
import { BOARD_GAME_PLAYS } from "./board_game_plays.ts";

export const HOBBIES_FAMILY: BuiltinFamilyDefinition = {
  name: "hobbies",
  displayName: "Hobbies & Collections",
  description: "Collectibles, wishlists, board games, plays.",
  collections: [COLLECTIBLE_ITEMS, COLLECTION_GROUPS, WISHLISTS, WISHLIST_ITEMS, BOARD_GAMES, BOARD_GAME_PLAYS],
};

export { COLLECTIBLE_ITEMS, COLLECTION_GROUPS, WISHLISTS, WISHLIST_ITEMS, BOARD_GAMES, BOARD_GAME_PLAYS };
