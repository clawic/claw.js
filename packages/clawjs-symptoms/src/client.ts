import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type SymptomsClientOptions = Omit<TrackingClientOptions, "domain">;

export class SymptomsClient extends TrackingApiClient {
  constructor(options: SymptomsClientOptions) {
    super({ ...options, domain: "symptoms" });
  }
}
