import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type ThoughtsRawClientOptions = Omit<SignalsClientOptions, "domain">;

export class ThoughtsRawClient extends SignalsApiClient {
  constructor(options: ThoughtsRawClientOptions) {
    super({ ...options, domain: "thoughts-raw" });
  }
}
