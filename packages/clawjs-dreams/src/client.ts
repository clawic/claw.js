import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type DreamsClientOptions = Omit<TrackingClientOptions, "domain">;

export class DreamsClient extends TrackingApiClient {
  constructor(options: DreamsClientOptions) {
    super({ ...options, domain: "dreams" });
  }
}
