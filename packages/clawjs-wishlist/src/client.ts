import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type WishlistClientOptions = Omit<TrackingClientOptions, "domain">;

export class WishlistClient extends TrackingApiClient {
  constructor(options: WishlistClientOptions) {
    super({ ...options, domain: "wishlist" });
  }
}
