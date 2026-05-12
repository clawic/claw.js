import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PossessionsClientOptions = Omit<TrackingClientOptions, "domain">;

export class PossessionsClient extends TrackingApiClient {
  constructor(options: PossessionsClientOptions) {
    super({ ...options, domain: "possessions" });
  }
}
