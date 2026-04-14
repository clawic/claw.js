import { DocumentListPage } from "../DocumentListPage";
import { DocumentDetailPage } from "../DocumentDetailPage";
import { EmptyState } from "../../components/EmptyState";

export function QueuePage() {
  return (
    <DocumentListPage
      kind="support_ticket"
      title="Support Queue"
      testId="support-queue-table"
      basePath="/support/tickets"
    />
  );
}

export function TicketsPage() {
  return (
    <DocumentListPage
      kind="support_ticket"
      title="Support Tickets"
      testId="support-tickets-table"
      basePath="/support/tickets"
    />
  );
}

export function TicketDetailPage() {
  return <DocumentDetailPage testId="support-ticket" />;
}

export function SlaPage() {
  return <div className="card"><div className="card-body"><EmptyState title="SLA Policies" text="Service level agreements and response targets." /></div></div>;
}
export function MacrosPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Macros" text="Canned responses and automation rules." /></div></div>;
}
export function KnowledgeLinksPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Knowledge Links" text="External knowledge base references." /></div></div>;
}
