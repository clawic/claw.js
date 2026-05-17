import crypto from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulid(now: number = Date.now()): string {
  let time = now;
  let timePart = "";
  for (let i = 0; i < 10; i += 1) {
    timePart = ENCODING[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const random = crypto.randomBytes(10);
  let randomPart = "";
  for (let i = 0; i < 10; i += 1) {
    randomPart += ENCODING[random[i] % 32];
  }
  return timePart + randomPart;
}

export function prefixedId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}
