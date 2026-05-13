import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type PredictionsClientOptions = Omit<SignalsClientOptions, "domain">;

export class PredictionsClient extends SignalsApiClient {
  constructor(options: PredictionsClientOptions) {
    super({ ...options, domain: "predictions" });
  }
}
