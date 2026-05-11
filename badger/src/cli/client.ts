export class BadgerClient {
  constructor(private readonly baseUrl: string, private readonly token: string | undefined) {}

  private headers(extra?: Record<string, string>): Headers {
    const headers = new Headers({ accept: "application/json" });
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    if (extra) for (const [k, v] of Object.entries(extra)) headers.set(k, v);
    return headers;
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    return await this.handle<T>(res);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const headers = this.headers();
    headers.set("content-type", "application/json");
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? "{}" : JSON.stringify(body),
    });
    return await this.handle<T>(res);
  }

  async patch<T = unknown>(path: string, body: unknown): Promise<T> {
    const headers = this.headers();
    headers.set("content-type", "application/json");
    const res = await fetch(`${this.baseUrl}${path}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    return await this.handle<T>(res);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const headers = this.headers();
    headers.set("content-type", "application/json");
    const res = await fetch(`${this.baseUrl}${path}`, { method: "PUT", headers, body: JSON.stringify(body) });
    return await this.handle<T>(res);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: "DELETE", headers: this.headers() });
    return await this.handle<T>(res);
  }

  async uploadFile<T = unknown>(path: string, name: string, mimeType: string, body: Buffer): Promise<T> {
    const headers = this.headers();
    const boundary = `----badger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    headers.set("content-type", `multipart/form-data; boundary=${boundary}`);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([head, body, tail]);
    const res = await fetch(`${this.baseUrl}${path}`, { method: "POST", headers, body: payload });
    return await this.handle<T>(res);
  }

  private async handle<T>(res: Response): Promise<T> {
    const text = await res.text();
    const payload = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) {
      const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return payload as T;
  }
}
