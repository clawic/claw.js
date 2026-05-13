import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SleepClientOptions = Omit<SignalsClientOptions, "domain">;

export class SleepClient extends SignalsApiClient {
  constructor(options: SleepClientOptions) {
    super({ ...options, domain: "sleep" });
  }
}
