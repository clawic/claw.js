import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type HotTakesClientOptions = Omit<SignalsClientOptions, "domain">;

export class HotTakesClient extends SignalsApiClient {
  constructor(options: HotTakesClientOptions) {
    super({ ...options, domain: "hot-takes" });
  }
}
