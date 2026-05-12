import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type TriggersClientOptions = Omit<TrackingClientOptions, "domain">;

export class TriggersClient extends TrackingApiClient {
  constructor(options: TriggersClientOptions) {
    super({ ...options, domain: "triggers" });
  }
}
