import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type EventsAttendedClientOptions = Omit<TrackingClientOptions, "domain">;

export class EventsAttendedClient extends TrackingApiClient {
  constructor(options: EventsAttendedClientOptions) {
    super({ ...options, domain: "events-attended" });
  }
}
