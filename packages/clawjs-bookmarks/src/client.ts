import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type BookmarksClientOptions = Omit<SignalsClientOptions, "domain">;

export class BookmarksClient extends SignalsApiClient {
  constructor(options: BookmarksClientOptions) {
    super({ ...options, domain: "bookmarks" });
  }
}
