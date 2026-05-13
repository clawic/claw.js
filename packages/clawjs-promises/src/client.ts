import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PromisesClientOptions = Omit<SignalsClientOptions, "domain">;

export class PromisesClient extends SignalsApiClient {
  constructor(options: PromisesClientOptions) {
    super({ ...options, domain: "promises" });
  }
}
