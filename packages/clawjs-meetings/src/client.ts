import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type MeetingsClientOptions = Omit<TrackingClientOptions, "domain">;

export class MeetingsClient extends TrackingApiClient {
  constructor(options: MeetingsClientOptions) {
    super({ ...options, domain: "meetings" });
  }
}
