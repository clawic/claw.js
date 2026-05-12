import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type FinanceClientOptions = Omit<TrackingClientOptions, "domain">;

export class FinanceClient extends TrackingApiClient {
  constructor(options: FinanceClientOptions) {
    super({ ...options, domain: "finance" });
  }
}
