import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type DreamsClientOptions = Omit<SignalsClientOptions, "domain">;

export class DreamsClient extends SignalsApiClient {
  constructor(options: DreamsClientOptions) {
    super({ ...options, domain: "dreams" });
  }
}
