import { Navigate } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";

export function FinanceIndex() {
  return <Navigate to="/finance/accounts" replace />;
}

export function JournalsPage() {
  return (
    <div className="card"><div className="card-body">
      <EmptyState title="Journals" text="Journal ledger view. Create entries from the Entries page." />
    </div></div>
  );
}

export function TaxesPage() {
  return (
    <div className="card"><div className="card-body">
      <EmptyState title="Tax Configuration" text="Tax rules are managed by the localization pack." />
    </div></div>
  );
}

export function BanksPage() {
  return (
    <div className="card"><div className="card-body">
      <EmptyState title="Bank Accounts" text="Bank account management and reconciliation sources." />
    </div></div>
  );
}

export function ReconciliationPage() {
  return (
    <div className="card"><div className="card-body">
      <EmptyState title="Reconciliation" text="Match bank statements with journal entries." />
    </div></div>
  );
}

export function AssetsPage() {
  return (
    <div className="card"><div className="card-body">
      <EmptyState title="Fixed Assets" text="Asset register with depreciation schedules." />
    </div></div>
  );
}

export function PeriodClosePage() {
  return <Navigate to="/finance/periods" replace />;
}
