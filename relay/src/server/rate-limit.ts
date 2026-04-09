export class MemoryRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  consume(key: string, windowMs: number, limit: number): boolean {
    const now = Date.now();
    const bucket = (this.buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (bucket.length >= limit) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.push(now);
    this.buckets.set(key, bucket);
    return true;
  }
}
