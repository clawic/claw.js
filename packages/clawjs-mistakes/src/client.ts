import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type MistakesClientOptions = Omit<SignalsClientOptions, "domain">;

export class MistakesClient extends SignalsApiClient {
  constructor(options: MistakesClientOptions) {
    super({ ...options, domain: "mistakes" });
  }
}
