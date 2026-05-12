import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type BookmarksClientOptions = Omit<TrackingClientOptions, "domain">;

export class BookmarksClient extends TrackingApiClient {
  constructor(options: BookmarksClientOptions) {
    super({ ...options, domain: "bookmarks" });
  }
}
