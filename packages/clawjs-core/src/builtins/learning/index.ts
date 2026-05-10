import type { BuiltinFamilyDefinition } from "../_types.ts";
import { COURSES } from "./courses.ts";
import { LESSONS } from "./lessons.ts";
import { STUDY_SESSIONS } from "./study_sessions.ts";
import { FLASHCARDS } from "./flashcards.ts";
import { FLASHCARD_DECKS } from "./flashcard_decks.ts";
import { FLASHCARD_REVIEWS } from "./flashcard_reviews.ts";
import { VOCABULARY_ITEMS } from "./vocabulary_items.ts";
import { LANGUAGES_LEARNING } from "./languages_learning.ts";
import { SKILLS } from "./skills.ts";
import { SKILL_PROGRESS_LOGS } from "./skill_progress_logs.ts";

export const LEARNING_FAMILY: BuiltinFamilyDefinition = {
  name: "learning",
  displayName: "Learning",
  description: "Courses, lessons, flashcards, vocabulary, languages, skills.",
  collections: [COURSES, LESSONS, STUDY_SESSIONS, FLASHCARDS, FLASHCARD_DECKS, FLASHCARD_REVIEWS, VOCABULARY_ITEMS, LANGUAGES_LEARNING, SKILLS, SKILL_PROGRESS_LOGS],
};

export { COURSES, LESSONS, STUDY_SESSIONS, FLASHCARDS, FLASHCARD_DECKS, FLASHCARD_REVIEWS, VOCABULARY_ITEMS, LANGUAGES_LEARNING, SKILLS, SKILL_PROGRESS_LOGS };
