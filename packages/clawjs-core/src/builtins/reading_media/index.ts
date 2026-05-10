import type { BuiltinFamilyDefinition } from "../_types.ts";
import { ARTICLE_PROGRESS } from "./article_progress.ts";
import { ARTICLES } from "./articles.ts";
import { AUDIOBOOK_PROGRESS } from "./audiobook_progress.ts";
import { AUDIOBOOKS } from "./audiobooks.ts";
import { BOOK_CLUB_MEETINGS } from "./book_club_meetings.ts";
import { BOOK_CLUBS } from "./book_clubs.ts";
import { BOOK_NOTES } from "./book_notes.ts";
import { BOOK_PROGRESS_LOGS } from "./book_progress_logs.ts";
import { BOOKS } from "./books.ts";
import { HIGHLIGHTS } from "./highlights.ts";
import { HIGHLIGHTS_COLLECTIONS } from "./highlights_collections.ts";
import { LIBRARIES } from "./libraries.ts";
import { MOVIES } from "./movies.ts";
import { PODCAST_EPISODES } from "./podcast_episodes.ts";
import { PODCAST_PROGRESS } from "./podcast_progress.ts";
import { PODCASTS } from "./podcasts.ts";
import { READING_CHALLENGES } from "./reading_challenges.ts";
import { READING_LISTS } from "./reading_lists.ts";
import { TV_EPISODES } from "./tv_episodes.ts";
import { TV_SHOWS } from "./tv_shows.ts";
import { WATCH_LOGS } from "./watch_logs.ts";
import { WATCHLIST_ITEMS } from "./watchlist_items.ts";

export const READING_MEDIA_FAMILY: BuiltinFamilyDefinition = {
  name: "reading_media",
  displayName: "Reading & Media",
  description: "Books, articles, podcasts, watchlist, movies, shows, audiobooks.",
  collections: [ARTICLE_PROGRESS, ARTICLES, AUDIOBOOK_PROGRESS, AUDIOBOOKS, BOOK_CLUB_MEETINGS, BOOK_CLUBS, BOOK_NOTES, BOOK_PROGRESS_LOGS, BOOKS, HIGHLIGHTS, HIGHLIGHTS_COLLECTIONS, LIBRARIES, MOVIES, PODCAST_EPISODES, PODCAST_PROGRESS, PODCASTS, READING_CHALLENGES, READING_LISTS, TV_EPISODES, TV_SHOWS, WATCH_LOGS, WATCHLIST_ITEMS],
};

export { ARTICLE_PROGRESS, ARTICLES, AUDIOBOOK_PROGRESS, AUDIOBOOKS, BOOK_CLUB_MEETINGS, BOOK_CLUBS, BOOK_NOTES, BOOK_PROGRESS_LOGS, BOOKS, HIGHLIGHTS, HIGHLIGHTS_COLLECTIONS, LIBRARIES, MOVIES, PODCAST_EPISODES, PODCAST_PROGRESS, PODCASTS, READING_CHALLENGES, READING_LISTS, TV_EPISODES, TV_SHOWS, WATCH_LOGS, WATCHLIST_ITEMS };
