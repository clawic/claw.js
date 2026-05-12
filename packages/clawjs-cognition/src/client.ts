import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type CognitionClientOptions = Omit<TrackingClientOptions, "domain">;

export class CognitionClient extends TrackingApiClient {
  constructor(options: CognitionClientOptions) {
    super({ ...options, domain: "cognition" });
  }
}
