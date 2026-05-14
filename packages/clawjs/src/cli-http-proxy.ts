import type http from "http";

export async function proxyHttpResponse(input: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  targetUrl: URL;
}): Promise<void> {
  const incomingUrl = new URL(input.request.url || "/", "http://127.0.0.1");
  const target = new URL(input.targetUrl.toString());
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;
  const headers = new Headers();
  for (const [key, value] of Object.entries(input.request.headers)) {
    if (key.toLowerCase() === "host" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  const body = input.request.method === "GET" || input.request.method === "HEAD"
    ? undefined
    : input.request as unknown as BodyInit;
  try {
    const upstream = await fetch(target, {
      method: input.request.method,
      headers,
      body,
      redirect: "manual",
      duplex: body ? "half" : undefined,
    } as RequestInit & { duplex?: "half" });
    input.response.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") input.response.setHeader(key, value);
    });
    if (!upstream.body) {
      input.response.end();
      return;
    }
    const reader = upstream.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      input.response.write(Buffer.from(chunk.value));
    }
    input.response.end();
  } catch (error) {
    input.response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    input.response.end(error instanceof Error ? error.message : "Domain proxy failed.");
  }
}
