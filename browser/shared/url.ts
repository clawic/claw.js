import type { BrowserNavigationState } from "./types.ts";

function isPrivateIpv4(hostname: string): boolean {
  return hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname.startsWith("10.")
    || hostname.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

function isLocalBrowserUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.hostname === "localhost" || isPrivateIpv4(url.hostname);
  } catch {
    return false;
  }
}

export function describeBrowserLocation(input: string, fallbackTitle = "Claw Browser"): BrowserNavigationState {
  if (!input) {
    return {
      title: fallbackTitle,
      url: "",
      displayUrl: "Not started",
      isLocalUrl: false,
    };
  }

  let displayUrl = input;
  const isLocalUrl = isLocalBrowserUrl(input);
  if (isLocalUrl) {
    displayUrl = "Local preview";
  }

  return {
    title: fallbackTitle,
    url: input,
    displayUrl,
    isLocalUrl,
  };
}
