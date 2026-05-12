import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type JournalClientOptions = Omit<TrackingClientOptions, "domain">;

export class JournalClient extends TrackingApiClient {
  constructor(options: JournalClientOptions) {
    super({ ...options, domain: "journal" });
  }
}
