import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type MistakesClientOptions = Omit<TrackingClientOptions, "domain">;

export class MistakesClient extends TrackingApiClient {
  constructor(options: MistakesClientOptions) {
    super({ ...options, domain: "mistakes" });
  }
}
