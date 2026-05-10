import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOARD_GAMES: BuiltinCollectionDefinition = {
  name: "board_games",
  displayName: "Board Games",
  family: "hobbies",
  aliases: ["board_game","board_games"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "minPlayers", type: "number" },
    { name: "maxPlayers", type: "number" },
    { name: "playtimeMinutes", type: "number" },
    { name: "publisher", type: "text" },
    { name: "year", type: "number" },
    { name: "tags", type: "json" },
    { name: "image", type: "file" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "board_games_title_idx", fields: ["title"] },
  ],
};
