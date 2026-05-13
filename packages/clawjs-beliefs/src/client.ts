import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type BeliefsClientOptions = Omit<SignalsClientOptions, "domain">;

export class BeliefsClient extends SignalsApiClient {
  constructor(options: BeliefsClientOptions) {
    super({ ...options, domain: "beliefs" });
  }
}
