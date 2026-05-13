import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type EventsAttendedClientOptions = Omit<SignalsClientOptions, "domain">;

export class EventsAttendedClient extends SignalsApiClient {
  constructor(options: EventsAttendedClientOptions) {
    super({ ...options, domain: "events-attended" });
  }
}
