import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type YearReviewsClientOptions = Omit<TrackingClientOptions, "domain">;

export class YearReviewsClient extends TrackingApiClient {
  constructor(options: YearReviewsClientOptions) {
    super({ ...options, domain: "year-reviews" });
  }
}
