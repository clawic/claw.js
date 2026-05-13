import { useState } from "react";
import { DocumentListPage } from "../DocumentListPage";
import { DocumentDetailPage } from "../DocumentDetailPage";
import { EmptyState } from "../../components/EmptyState";

export function PayrollRunsPage() {
  return (
    <DocumentListPage
      kind="payroll_run"
      title="Payroll Runs"
      testId="payroll-runs-table"
      basePath="/payroll/runs"
    />
  );
}

export function PayrollRunDetailPage() {
  return <DocumentDetailPage testId="payroll-run" />;
}

export function PayrollCalendarPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Payroll Calendar" text="Pay periods and processing schedule." /></div></div>;
}
export function PayslipsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Payslips" text="Individual payslip records." /></div></div>;
}
export function IncidentsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Payroll Incidents" text="Adjustments, bonuses, and deductions." /></div></div>;
}
export function PostingsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Payroll Postings" text="GL postings from payroll runs." /></div></div>;
}
export function PayrollClosePage() {
  return <div className="card"><div className="card-body"><EmptyState title="Payroll Close" text="Period closing and reconciliation." /></div></div>;
}
