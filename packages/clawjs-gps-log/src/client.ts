import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type GpsLogClientOptions = Omit<SignalsClientOptions, "domain">;

export class GpsLogClient extends SignalsApiClient {
  constructor(options: GpsLogClientOptions) {
    super({ ...options, domain: "gps-log" });
  }
}
