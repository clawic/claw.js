import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type ConflictsClientOptions = Omit<TrackingClientOptions, "domain">;

export class ConflictsClient extends TrackingApiClient {
  constructor(options: ConflictsClientOptions) {
    super({ ...options, domain: "conflicts" });
  }
}
