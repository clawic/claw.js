import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type LearningClientOptions = Omit<TrackingClientOptions, "domain">;

export class LearningClient extends TrackingApiClient {
  constructor(options: LearningClientOptions) {
    super({ ...options, domain: "learning" });
  }
}
