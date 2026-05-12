import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PromisesClientOptions = Omit<TrackingClientOptions, "domain">;

export class PromisesClient extends TrackingApiClient {
  constructor(options: PromisesClientOptions) {
    super({ ...options, domain: "promises" });
  }
}
