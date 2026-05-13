import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SubstancesClientOptions = Omit<SignalsClientOptions, "domain">;

export class SubstancesClient extends SignalsApiClient {
  constructor(options: SubstancesClientOptions) {
    super({ ...options, domain: "substances" });
  }
}
