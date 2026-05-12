import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type GpsLogClientOptions = Omit<TrackingClientOptions, "domain">;

export class GpsLogClient extends TrackingApiClient {
  constructor(options: GpsLogClientOptions) {
    super({ ...options, domain: "gps-log" });
  }
}
