import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type DecisionsClientOptions = Omit<TrackingClientOptions, "domain">;

export class DecisionsClient extends TrackingApiClient {
  constructor(options: DecisionsClientOptions) {
    super({ ...options, domain: "decisions" });
  }
}
