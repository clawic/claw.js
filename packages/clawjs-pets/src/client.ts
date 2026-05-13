import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PetsClientOptions = Omit<SignalsClientOptions, "domain">;

export class PetsClient extends SignalsApiClient {
  constructor(options: PetsClientOptions) {
    super({ ...options, domain: "pets" });
  }
}
