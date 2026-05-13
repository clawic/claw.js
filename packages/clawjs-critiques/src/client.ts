import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type CritiquesClientOptions = Omit<SignalsClientOptions, "domain">;

export class CritiquesClient extends SignalsApiClient {
  constructor(options: CritiquesClientOptions) {
    super({ ...options, domain: "critiques" });
  }
}
