import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type BeautyClientOptions = Omit<SignalsClientOptions, "domain">;

export class BeautyClient extends SignalsApiClient {
  constructor(options: BeautyClientOptions) {
    super({ ...options, domain: "beauty" });
  }
}
