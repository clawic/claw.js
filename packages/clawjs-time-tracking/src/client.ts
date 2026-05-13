import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type TimeSignalsClientOptions = Omit<SignalsClientOptions, "domain">;

export class TimeTrackingClient extends SignalsApiClient {
  constructor(options: TimeSignalsClientOptions) {
    super({ ...options, domain: "time-tracking" });
  }
}
