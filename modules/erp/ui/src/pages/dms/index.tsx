import { EmptyState } from "../../components/EmptyState";

export function LibrariesPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Document Libraries" text="Organized document collections." /></div></div>;
}
export function DmsDocumentsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Documents" text="All documents across libraries." /></div></div>;
}
export function VersionsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Versions" text="Document version history." /></div></div>;
}
export function DmsPermissionsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Permissions" text="Document access control." /></div></div>;
}
export function SignaturesPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Signatures" text="Electronic and digital signatures." /></div></div>;
}
export function RetentionPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Retention" text="Document retention policies and schedules." /></div></div>;
}
