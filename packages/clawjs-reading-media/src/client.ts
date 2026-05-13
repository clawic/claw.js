import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type ReadingMediaClientOptions = Omit<SignalsClientOptions, "domain">;

export class ReadingMediaClient extends SignalsApiClient {
  constructor(options: ReadingMediaClientOptions) {
    super({ ...options, domain: "reading-media" });
  }
}
