import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type PersonalityTestsClientOptions = Omit<TrackingClientOptions, "domain">;

export class PersonalityTestsClient extends TrackingApiClient {
  constructor(options: PersonalityTestsClientOptions) {
    super({ ...options, domain: "personality-tests" });
  }
}
