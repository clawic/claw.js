import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PainMapClientOptions = Omit<SignalsClientOptions, "domain">;

export class PainMapClient extends SignalsApiClient {
  constructor(options: PainMapClientOptions) {
    super({ ...options, domain: "pain-map" });
  }
}
