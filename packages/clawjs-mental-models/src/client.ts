import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type MentalModelsClientOptions = Omit<SignalsClientOptions, "domain">;

export class MentalModelsClient extends SignalsApiClient {
  constructor(options: MentalModelsClientOptions) {
    super({ ...options, domain: "mental-models" });
  }
}
