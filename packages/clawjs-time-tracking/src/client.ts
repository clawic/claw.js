import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type TimeTrackingClientOptions = Omit<TrackingClientOptions, "domain">;

export class TimeTrackingClient extends TrackingApiClient {
  constructor(options: TimeTrackingClientOptions) {
    super({ ...options, domain: "time-tracking" });
  }
}
