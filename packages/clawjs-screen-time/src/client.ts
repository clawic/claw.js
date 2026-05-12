import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type ScreenTimeClientOptions = Omit<TrackingClientOptions, "domain">;

export class ScreenTimeClient extends TrackingApiClient {
  constructor(options: ScreenTimeClientOptions) {
    super({ ...options, domain: "screen-time" });
  }
}
