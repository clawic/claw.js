import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type YearReviewsClientOptions = Omit<SignalsClientOptions, "domain">;

export class YearReviewsClient extends SignalsApiClient {
  constructor(options: YearReviewsClientOptions) {
    super({ ...options, domain: "year-reviews" });
  }
}
