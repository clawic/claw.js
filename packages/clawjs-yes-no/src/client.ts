import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type YesNoClientOptions = Omit<SignalsClientOptions, "domain">;

export class YesNoClient extends SignalsApiClient {
  constructor(options: YesNoClientOptions) {
    super({ ...options, domain: "yes-no" });
  }
}
