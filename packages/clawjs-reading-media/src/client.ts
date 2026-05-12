import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type ReadingMediaClientOptions = Omit<TrackingClientOptions, "domain">;

export class ReadingMediaClient extends TrackingApiClient {
  constructor(options: ReadingMediaClientOptions) {
    super({ ...options, domain: "reading-media" });
  }
}
