import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type EmotionsClientOptions = Omit<TrackingClientOptions, "domain">;

export class EmotionsClient extends TrackingApiClient {
  constructor(options: EmotionsClientOptions) {
    super({ ...options, domain: "emotions" });
  }
}
