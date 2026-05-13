import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type HydrationClientOptions = Omit<SignalsClientOptions, "domain">;

export class HydrationClient extends SignalsApiClient {
  constructor(options: HydrationClientOptions) {
    super({ ...options, domain: "hydration" });
  }
}
