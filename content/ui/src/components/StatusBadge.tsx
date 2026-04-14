import { STATUS_BADGE_MAP, type EntryStatus } from "../api/types";
import { Badge } from "./Badge";

const LABEL: Record<EntryStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  partially_published: "Partial",
  failed: "Failed",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  return <Badge variant={STATUS_BADGE_MAP[status]}>{LABEL[status] ?? status}</Badge>;
}
