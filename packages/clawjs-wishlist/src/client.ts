import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type WishlistClientOptions = Omit<SignalsClientOptions, "domain">;

export class WishlistClient extends SignalsApiClient {
  constructor(options: WishlistClientOptions) {
    super({ ...options, domain: "wishlist" });
  }
}
