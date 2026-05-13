import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type StretchingClientOptions = Omit<SignalsClientOptions, "domain">;

export class StretchingClient extends SignalsApiClient {
  constructor(options: StretchingClientOptions) {
    super({ ...options, domain: "stretching" });
  }
}
