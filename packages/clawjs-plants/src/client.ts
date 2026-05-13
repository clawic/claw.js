import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PlantsClientOptions = Omit<SignalsClientOptions, "domain">;

export class PlantsClient extends SignalsApiClient {
  constructor(options: PlantsClientOptions) {
    super({ ...options, domain: "plants" });
  }
}
