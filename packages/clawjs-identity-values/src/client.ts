import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type IdentityValuesClientOptions = Omit<SignalsClientOptions, "domain">;

export class IdentityValuesClient extends SignalsApiClient {
  constructor(options: IdentityValuesClientOptions) {
    super({ ...options, domain: "identity-values" });
  }
}
