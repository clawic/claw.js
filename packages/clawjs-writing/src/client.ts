import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type WritingClientOptions = Omit<TrackingClientOptions, "domain">;

export class WritingClient extends TrackingApiClient {
  constructor(options: WritingClientOptions) {
    super({ ...options, domain: "writing" });
  }
}
