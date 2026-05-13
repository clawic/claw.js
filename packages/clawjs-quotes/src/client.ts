import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type QuotesClientOptions = Omit<SignalsClientOptions, "domain">;

export class QuotesClient extends SignalsApiClient {
  constructor(options: QuotesClientOptions) {
    super({ ...options, domain: "quotes" });
  }
}
