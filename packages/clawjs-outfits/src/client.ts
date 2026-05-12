import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type OutfitsClientOptions = Omit<TrackingClientOptions, "domain">;

export class OutfitsClient extends TrackingApiClient {
  constructor(options: OutfitsClientOptions) {
    super({ ...options, domain: "outfits" });
  }
}
