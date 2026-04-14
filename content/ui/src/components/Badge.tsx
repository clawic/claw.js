import type { BadgeVariant } from "../api/types";

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
