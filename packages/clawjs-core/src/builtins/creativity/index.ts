import type { BuiltinFamilyDefinition } from "../_types.ts";
import { CREATIVE_PROJECTS } from "./creative_projects.ts";
import { IDEAS } from "./ideas.ts";
import { WRITING_PIECES } from "./writing_pieces.ts";
import { MUSIC_TRACKS } from "./music_tracks.ts";
import { ARTWORKS } from "./artworks.ts";
import { INVENTIONS } from "./inventions.ts";
import { CREATIVE_DRAFTS } from "./creative_drafts.ts";

export const CREATIVITY_FAMILY: BuiltinFamilyDefinition = {
  name: "creativity",
  displayName: "Creativity & Projects",
  description: "Side projects, ideas, writing, music, art, inventions.",
  collections: [CREATIVE_PROJECTS, IDEAS, WRITING_PIECES, MUSIC_TRACKS, ARTWORKS, INVENTIONS, CREATIVE_DRAFTS],
};

export { CREATIVE_PROJECTS, IDEAS, WRITING_PIECES, MUSIC_TRACKS, ARTWORKS, INVENTIONS, CREATIVE_DRAFTS };
