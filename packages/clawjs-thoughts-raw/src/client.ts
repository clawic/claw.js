import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type ThoughtsRawClientOptions = Omit<TrackingClientOptions, "domain">;

export class ThoughtsRawClient extends TrackingApiClient {
  constructor(options: ThoughtsRawClientOptions) {
    super({ ...options, domain: "thoughts-raw" });
  }
}
