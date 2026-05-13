import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type HealthClientOptions = Omit<SignalsClientOptions, "domain">;

export class HealthClient extends SignalsApiClient {
  constructor(options: HealthClientOptions) {
    super({ ...options, domain: "health" });
  }
}
