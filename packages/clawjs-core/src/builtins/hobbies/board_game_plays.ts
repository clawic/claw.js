import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOARD_GAME_PLAYS: BuiltinCollectionDefinition = {
  name: "board_game_plays",
  displayName: "Board Game Plays",
  family: "hobbies",
  aliases: ["board_game_play","board_game_plays"],
  fields: [
    { name: "boardGameId", type: "relation", required: true, relation: { collectionName: "board_games" } },
    { name: "playedAt", type: "date", required: true },
    { name: "players", type: "json" },
    { name: "winner", type: "text" },
    { name: "durationMinutes", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "board_game_plays_game_idx", fields: ["boardGameId"] },
  ],
};
