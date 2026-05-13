import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type BodyMeasuresClientOptions = Omit<SignalsClientOptions, "domain">;

export class BodyMeasuresClient extends SignalsApiClient {
  constructor(options: BodyMeasuresClientOptions) {
    super({ ...options, domain: "body-measures" });
  }
}
