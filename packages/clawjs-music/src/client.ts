import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type MusicClientOptions = Omit<TrackingClientOptions, "domain">;

export class MusicClient extends TrackingApiClient {
  constructor(options: MusicClientOptions) {
    super({ ...options, domain: "music" });
  }
}
