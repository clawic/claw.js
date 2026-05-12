import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type WildlifeClientOptions = Omit<TrackingClientOptions, "domain">;

export class WildlifeClient extends TrackingApiClient {
  constructor(options: WildlifeClientOptions) {
    super({ ...options, domain: "wildlife" });
  }
}
