import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PossessionsClientOptions = Omit<SignalsClientOptions, "domain">;

export class PossessionsClient extends SignalsApiClient {
  constructor(options: PossessionsClientOptions) {
    super({ ...options, domain: "possessions" });
  }
}
