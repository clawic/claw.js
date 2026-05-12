import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type GiftsClientOptions = Omit<TrackingClientOptions, "domain">;

export class GiftsClient extends TrackingApiClient {
  constructor(options: GiftsClientOptions) {
    super({ ...options, domain: "gifts" });
  }
}
