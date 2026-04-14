import type { WikiStore } from "./db.ts";
import type { WikiPage, CombinedSearchResult, FtsSearchResult, GraphSearchResult } from "../shared/types.ts";

export interface SearchOptions {
  query?: string;
  pageId?: string;
  spaceId?: string;
  modes?: Array<"fts" | "graph">;
  weights?: { fts?: number; graph?: number };
  depth?: number;
  limit?: number;
}

export class WikiSearchEngine {
  constructor(private readonly store: WikiStore) {}

  searchFts(query: string, options: { spaceId?: string; limit?: number } = {}): FtsSearchResult[] {
    return this.store.searchFts(query, options);
  }

  searchGraph(pageId: string, options: { depth?: number; limit?: number } = {}): GraphSearchResult[] {
    const depth = options.depth ?? 3;
    const limit = options.limit ?? 20;
    const traversalResults = this.store.traverseGraph(pageId, depth);

    const results: GraphSearchResult[] = [];
    for (const entry of traversalResults.slice(0, limit)) {
      const page = this.store.getPageById(entry.pageId);
      if (!page) continue;
      results.push({
        page,
        depth: entry.depth,
        path: entry.path,
      });
    }

    return results;
  }

  searchCombined(options: SearchOptions): CombinedSearchResult[] {
    const modes = options.modes ?? ["fts", "graph"];
    const weights = { fts: options.weights?.fts ?? 0.6, graph: options.weights?.graph ?? 0.4 };
    const limit = options.limit ?? 20;

    const scoreMap = new Map<string, { page: WikiPage; score: number; snippet?: string; depth?: number }>();

    if (modes.includes("fts") && options.query) {
      const ftsResults = this.searchFts(options.query, { spaceId: options.spaceId, limit: limit * 2 });

      // Normalize FTS scores to 0-1 (FTS5 rank is negative, closer to 0 = better)
      const maxAbsRank = Math.max(...ftsResults.map((r) => Math.abs(r.rank)), 1);
      for (const result of ftsResults) {
        const normalizedScore = 1 - (Math.abs(result.rank) / maxAbsRank);
        const existing = scoreMap.get(result.page.id);
        const score = (existing?.score ?? 0) + normalizedScore * weights.fts;
        scoreMap.set(result.page.id, {
          page: result.page,
          score,
          snippet: result.snippet,
          depth: existing?.depth,
        });
      }
    }

    if (modes.includes("graph") && options.pageId) {
      const graphResults = this.searchGraph(options.pageId, { depth: options.depth, limit: limit * 2 });

      // Normalize graph scores: closer depth = higher score
      const maxDepth = Math.max(...graphResults.map((r) => r.depth), 1);
      for (const result of graphResults) {
        const normalizedScore = 1 - ((result.depth - 1) / maxDepth);
        const existing = scoreMap.get(result.page.id);
        const score = (existing?.score ?? 0) + normalizedScore * weights.graph;
        scoreMap.set(result.page.id, {
          page: result.page,
          score,
          snippet: existing?.snippet,
          depth: result.depth,
        });
      }
    }

    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
