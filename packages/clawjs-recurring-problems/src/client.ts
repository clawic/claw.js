import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type RecurringProblemsClientOptions = Omit<TrackingClientOptions, "domain">;

export class RecurringProblemsClient extends TrackingApiClient {
  constructor(options: RecurringProblemsClientOptions) {
    super({ ...options, domain: "recurring-problems" });
  }
}
