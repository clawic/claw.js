import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type CognitionClientOptions = Omit<SignalsClientOptions, "domain">;

export class CognitionClient extends SignalsApiClient {
  constructor(options: CognitionClientOptions) {
    super({ ...options, domain: "cognition" });
  }
}
