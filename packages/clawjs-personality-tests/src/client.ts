import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PersonalityTestsClientOptions = Omit<SignalsClientOptions, "domain">;

export class PersonalityTestsClient extends SignalsApiClient {
  constructor(options: PersonalityTestsClientOptions) {
    super({ ...options, domain: "personality-tests" });
  }
}
