import { TrackingApiClient, type TrackingClientOptions } from "@clawjs/tracking-runtime";

export type WeatherClientOptions = Omit<TrackingClientOptions, "domain">;

export class WeatherClient extends TrackingApiClient {
  constructor(options: WeatherClientOptions) {
    super({ ...options, domain: "weather" });
  }
}
