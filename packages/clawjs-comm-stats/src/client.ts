import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type CommStatsClientOptions = Omit<SignalsClientOptions, "domain">;

export class CommStatsClient extends SignalsApiClient {
  constructor(options: CommStatsClientOptions) {
    super({ ...options, domain: "comm-stats" });
  }
}
