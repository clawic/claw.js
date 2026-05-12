import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type IdentityValuesClientOptions = Omit<TrackingClientOptions, "domain">;

export class IdentityValuesClient extends TrackingApiClient {
  constructor(options: IdentityValuesClientOptions) {
    super({ ...options, domain: "identity-values" });
  }
}
