import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type DecisionsClientOptions = Omit<SignalsClientOptions, "domain">;

export class DecisionsClient extends SignalsApiClient {
  constructor(options: DecisionsClientOptions) {
    super({ ...options, domain: "decisions" });
  }
}
