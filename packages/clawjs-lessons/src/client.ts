import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type LessonsClientOptions = Omit<TrackingClientOptions, "domain">;

export class LessonsClient extends TrackingApiClient {
  constructor(options: LessonsClientOptions) {
    super({ ...options, domain: "lessons" });
  }
}
