import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PhotographyClientOptions = Omit<TrackingClientOptions, "domain">;

export class PhotographyClient extends TrackingApiClient {
  constructor(options: PhotographyClientOptions) {
    super({ ...options, domain: "photography" });
  }
}
