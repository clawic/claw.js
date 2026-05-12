import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type IncomeClientOptions = Omit<TrackingClientOptions, "domain">;

export class IncomeClient extends TrackingApiClient {
  constructor(options: IncomeClientOptions) {
    super({ ...options, domain: "income" });
  }
}
