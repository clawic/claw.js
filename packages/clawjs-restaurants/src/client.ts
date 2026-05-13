import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type RestaurantsClientOptions = Omit<SignalsClientOptions, "domain">;

export class RestaurantsClient extends SignalsApiClient {
  constructor(options: RestaurantsClientOptions) {
    super({ ...options, domain: "restaurants" });
  }
}
