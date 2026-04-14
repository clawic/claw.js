import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { DocumentListPage } from "../DocumentListPage";
import { DocumentDetailPage } from "../DocumentDetailPage";
import { FormEngine } from "../../components/FormEngine";
import { useApi } from "../../hooks/useApi";
import { EmptyState } from "../../components/EmptyState";

export function QuotesPage() {
  return (
    <DocumentListPage
      kind="sales_quote"
      title="Sales Quotes"
      testId="sales-quote-table"
      basePath="/sales/quotes"
      createPath="/sales/quotes/create"
    />
  );
}

export function QuoteCreatePage() {
  const navigate = useNavigate();
  const { data: schema, loading } = useApi(() => api.formSchema("sales.quote.create"), []);

  if (loading || !schema) return <div className="skeleton skeleton-card" style={{ height: 300 }} />;

  const handleSubmit = async (values: Record<string, unknown>) => {
    await api.createSalesQuote(values);
    navigate("/sales/quotes");
  };

  return (
    <div className="card">
      <div className="card-body">
        <FormEngine schema={schema} onSubmit={handleSubmit} onCancel={() => navigate("/sales/quotes")} />
      </div>
    </div>
  );
}

export function QuoteDetailPage() {
  return <DocumentDetailPage testId="sales-quote" />;
}

export function OrdersPage() {
  return (
    <DocumentListPage
      kind="sales_order"
      title="Sales Orders"
      testId="sales-orders-table"
      basePath="/sales/orders"
    />
  );
}

export function OrderDetailPage() {
  return <DocumentDetailPage testId="sales-order" />;
}

export function ShipmentsPage() {
  return (
    <DocumentListPage
      kind="shipment"
      title="Shipments"
      testId="sales-shipments-table"
      basePath="/sales/shipments"
    />
  );
}

export function InvoicesPage() {
  return (
    <DocumentListPage
      kind="customer_invoice"
      title="Sales Invoices"
      testId="sales-invoices-table"
      basePath="/sales/invoices"
    />
  );
}

export function InvoiceDetailPage() {
  return <DocumentDetailPage testId="sales-invoice" />;
}

export function LeadsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Leads" text="Pipeline leads management." /></div></div>;
}
export function OpportunitiesPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Opportunities" text="Sales opportunities tracker." /></div></div>;
}
export function SalesAccountsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Sales Accounts" text="Customer accounts overview." /></div></div>;
}
export function ContactsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Contacts" text="Customer contacts directory." /></div></div>;
}
export function SubscriptionsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Subscriptions" text="Recurring subscription management." /></div></div>;
}
