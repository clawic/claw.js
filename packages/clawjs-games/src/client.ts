import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type GamesClientOptions = Omit<SignalsClientOptions, "domain">;

export class GamesClient extends SignalsApiClient {
  constructor(options: GamesClientOptions) {
    super({ ...options, domain: "games" });
  }
}
