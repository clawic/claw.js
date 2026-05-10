import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BOOKS } from "./books.ts";
import { BOOK_PROGRESS_LOGS } from "./book_progress_logs.ts";
import { HIGHLIGHTS } from "./highlights.ts";
import { BOOK_NOTES } from "./book_notes.ts";
import { READING_LISTS } from "./reading_lists.ts";
import { ARTICLES } from "./articles.ts";
import { ARTICLE_PROGRESS } from "./article_progress.ts";
import { PODCASTS } from "./podcasts.ts";
import { PODCAST_EPISODES } from "./podcast_episodes.ts";
import { PODCAST_PROGRESS } from "./podcast_progress.ts";
import { WATCHLIST_ITEMS } from "./watchlist_items.ts";
import { WATCH_LOGS } from "./watch_logs.ts";
import { MOVIES } from "./movies.ts";
import { TV_SHOWS } from "./tv_shows.ts";
import { TV_EPISODES } from "./tv_episodes.ts";
import { AUDIOBOOKS } from "./audiobooks.ts";
import { AUDIOBOOK_PROGRESS } from "./audiobook_progress.ts";
import { LIBRARIES } from "./libraries.ts";

export const READING_MEDIA_FAMILY: BuiltinFamilyDefinition = {
  name: "reading_media",
  displayName: "Reading & Media",
  description: "Books, articles, podcasts, watchlist, movies, shows, audiobooks.",
  collections: [BOOKS, BOOK_PROGRESS_LOGS, HIGHLIGHTS, BOOK_NOTES, READING_LISTS, ARTICLES, ARTICLE_PROGRESS, PODCASTS, PODCAST_EPISODES, PODCAST_PROGRESS, WATCHLIST_ITEMS, WATCH_LOGS, MOVIES, TV_SHOWS, TV_EPISODES, AUDIOBOOKS, AUDIOBOOK_PROGRESS, LIBRARIES],
};

export { BOOKS, BOOK_PROGRESS_LOGS, HIGHLIGHTS, BOOK_NOTES, READING_LISTS, ARTICLES, ARTICLE_PROGRESS, PODCASTS, PODCAST_EPISODES, PODCAST_PROGRESS, WATCHLIST_ITEMS, WATCH_LOGS, MOVIES, TV_SHOWS, TV_EPISODES, AUDIOBOOKS, AUDIOBOOK_PROGRESS, LIBRARIES };
