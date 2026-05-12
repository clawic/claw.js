import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PredictionsClientOptions = Omit<TrackingClientOptions, "domain">;

export class PredictionsClient extends TrackingApiClient {
  constructor(options: PredictionsClientOptions) {
    super({ ...options, domain: "predictions" });
  }
}
