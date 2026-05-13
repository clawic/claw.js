import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type DatingClientOptions = Omit<SignalsClientOptions, "domain">;

export class DatingClient extends SignalsApiClient {
  constructor(options: DatingClientOptions) {
    super({ ...options, domain: "dating" });
  }
}
