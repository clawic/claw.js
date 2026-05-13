import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type MusicClientOptions = Omit<SignalsClientOptions, "domain">;

export class MusicClient extends SignalsApiClient {
  constructor(options: MusicClientOptions) {
    super({ ...options, domain: "music" });
  }
}
