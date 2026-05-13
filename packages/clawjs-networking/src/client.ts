import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type NetworkingClientOptions = Omit<SignalsClientOptions, "domain">;

export class NetworkingClient extends SignalsApiClient {
  constructor(options: NetworkingClientOptions) {
    super({ ...options, domain: "networking" });
  }
}
