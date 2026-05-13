import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type OutfitsClientOptions = Omit<SignalsClientOptions, "domain">;

export class OutfitsClient extends SignalsApiClient {
  constructor(options: OutfitsClientOptions) {
    super({ ...options, domain: "outfits" });
  }
}
