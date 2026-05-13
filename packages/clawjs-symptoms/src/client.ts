import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SymptomsClientOptions = Omit<SignalsClientOptions, "domain">;

export class SymptomsClient extends SignalsApiClient {
  constructor(options: SymptomsClientOptions) {
    super({ ...options, domain: "symptoms" });
  }
}
