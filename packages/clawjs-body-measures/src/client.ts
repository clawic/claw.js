import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type BodyMeasuresClientOptions = Omit<TrackingClientOptions, "domain">;

export class BodyMeasuresClient extends TrackingApiClient {
  constructor(options: BodyMeasuresClientOptions) {
    super({ ...options, domain: "body-measures" });
  }
}
