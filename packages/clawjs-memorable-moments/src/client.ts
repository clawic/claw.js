import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type MemorableMomentsClientOptions = Omit<TrackingClientOptions, "domain">;

export class MemorableMomentsClient extends TrackingApiClient {
  constructor(options: MemorableMomentsClientOptions) {
    super({ ...options, domain: "memorable-moments" });
  }
}
