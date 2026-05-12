import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type GamesClientOptions = Omit<TrackingClientOptions, "domain">;

export class GamesClient extends TrackingApiClient {
  constructor(options: GamesClientOptions) {
    super({ ...options, domain: "games" });
  }
}
