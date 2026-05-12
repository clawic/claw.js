import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type YesNoClientOptions = Omit<TrackingClientOptions, "domain">;

export class YesNoClient extends TrackingApiClient {
  constructor(options: YesNoClientOptions) {
    super({ ...options, domain: "yes-no" });
  }
}
