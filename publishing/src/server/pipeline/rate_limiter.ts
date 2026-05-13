interface Bucket {
  /** Epoch ms until which dispatch is paused. */
  blockedUntil: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  private key(scope: { family: string; accountId?: string }): string {
    return scope.accountId ? `acct:${scope.accountId}` : `fam:${scope.family}`;
  }

  backoff(scope: { family: string; accountId?: string }, seconds: number): void {
    const key = this.key(scope);
    const until = Date.now() + Math.max(1, seconds) * 1000;
    const cur = this.buckets.get(key);
    if (!cur || cur.blockedUntil < until) this.buckets.set(key, { blockedUntil: until });
  }

  until(scope: { family: string; accountId?: string }): number {
    const cur = this.buckets.get(this.key(scope));
    if (!cur) return 0;
    const remaining = cur.blockedUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }
}
