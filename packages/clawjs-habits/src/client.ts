import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type HabitsClientOptions = Omit<SignalsClientOptions, "domain">;

export class HabitsClient extends SignalsApiClient {
  constructor(options: HabitsClientOptions) {
    super({ ...options, domain: "habits" });
  }
}
