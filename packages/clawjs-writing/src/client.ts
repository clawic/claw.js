import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type WritingClientOptions = Omit<SignalsClientOptions, "domain">;

export class WritingClient extends SignalsApiClient {
  constructor(options: WritingClientOptions) {
    super({ ...options, domain: "writing" });
  }
}
