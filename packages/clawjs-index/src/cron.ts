/// Minimal 5-field cron parser. Format: `minute hour day-of-month month day-of-week`.

interface FieldRange { min: number; max: number; }

function parseField(spec: string, range: FieldRange): number[] {
  if (spec === "*") {
    const values: number[] = [];
    for (let i = range.min; i <= range.max; i += 1) values.push(i);
    return values;
  }
  const out = new Set<number>();
  for (const piece of spec.split(",")) {
    let step = 1;
    let body = piece;
    const stepIdx = piece.indexOf("/");
    if (stepIdx !== -1) {
      step = Number(piece.slice(stepIdx + 1));
      body = piece.slice(0, stepIdx);
    }
    if (body === "*") {
      for (let i = range.min; i <= range.max; i += step) out.add(i);
      continue;
    }
    const dashIdx = body.indexOf("-");
    if (dashIdx !== -1) {
      const from = Number(body.slice(0, dashIdx));
      const to = Number(body.slice(dashIdx + 1));
      for (let i = from; i <= to; i += step) out.add(i);
      continue;
    }
    out.add(Number(body));
  }
  return Array.from(out).sort((a, b) => a - b);
}

export interface CronExpression {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

export function parseCron(expr: string): CronExpression {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression "${expr}": expected 5 fields, got ${fields.length}`);
  }
  return {
    minutes: parseField(fields[0]!, { min: 0, max: 59 }),
    hours: parseField(fields[1]!, { min: 0, max: 23 }),
    daysOfMonth: parseField(fields[2]!, { min: 1, max: 31 }),
    months: parseField(fields[3]!, { min: 1, max: 12 }),
    daysOfWeek: parseField(fields[4]!, { min: 0, max: 6 }),
  };
}

export function nextCronFire(expr: string, from: Date = new Date()): Date {
  const parsed = parseCron(expr);
  const cursor = new Date(from.getTime() + 60_000);
  cursor.setSeconds(0, 0);
  for (let attempts = 0; attempts < 60 * 24 * 366; attempts += 1) {
    const month = cursor.getMonth() + 1;
    const dayOfMonth = cursor.getDate();
    const dayOfWeek = cursor.getDay();
    const hour = cursor.getHours();
    const minute = cursor.getMinutes();
    if (
      parsed.months.includes(month) &&
      parsed.daysOfMonth.includes(dayOfMonth) &&
      parsed.daysOfWeek.includes(dayOfWeek) &&
      parsed.hours.includes(hour) &&
      parsed.minutes.includes(minute)
    ) {
      return cursor;
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  throw new Error(`Cron expression "${expr}" never matches inside a year window`);
}

export function describeCron(expr: string): string {
  const map: [RegExp, string][] = [
    [/^\*\/(\d+) \* \* \* \*$/, "every $1 minutes"],
    [/^0 \* \* \* \*$/, "every hour"],
    [/^0 \*\/(\d+) \* \* \*$/, "every $1 hours"],
    [/^(\d+) (\d+) \* \* \*$/, "daily at $2:$1"],
    [/^0 9 \* \* 1-5$/, "weekdays at 09:00"],
  ];
  const cleaned = expr.trim();
  for (const [regex, replacement] of map) {
    if (regex.test(cleaned)) return cleaned.replace(regex, replacement);
  }
  return cleaned;
}
