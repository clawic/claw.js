import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type SubscriptionsClientOptions = Omit<SignalsClientOptions, "domain">;

export class SubscriptionsClient extends SignalsApiClient {
  constructor(options: SubscriptionsClientOptions) {
    super({ ...options, domain: "subscriptions" });
  }
}
