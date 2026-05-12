import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type StretchingClientOptions = Omit<TrackingClientOptions, "domain">;

export class StretchingClient extends TrackingApiClient {
  constructor(options: StretchingClientOptions) {
    super({ ...options, domain: "stretching" });
  }
}
