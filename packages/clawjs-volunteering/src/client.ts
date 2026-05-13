import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type VolunteeringClientOptions = Omit<SignalsClientOptions, "domain">;

export class VolunteeringClient extends SignalsApiClient {
  constructor(options: VolunteeringClientOptions) {
    super({ ...options, domain: "volunteering" });
  }
}
