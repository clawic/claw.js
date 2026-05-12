import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type BirthdaysClientOptions = Omit<TrackingClientOptions, "domain">;

export class BirthdaysClient extends TrackingApiClient {
  constructor(options: BirthdaysClientOptions) {
    super({ ...options, domain: "birthdays" });
  }
}
