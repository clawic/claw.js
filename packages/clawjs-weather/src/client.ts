import { SignalsApiClient, type SignalsClientOptions } from "@clawjs/signals";

export type WeatherClientOptions = Omit<SignalsClientOptions, "domain">;

export class WeatherClient extends SignalsApiClient {
  constructor(options: WeatherClientOptions) {
    super({ ...options, domain: "weather" });
  }
}
