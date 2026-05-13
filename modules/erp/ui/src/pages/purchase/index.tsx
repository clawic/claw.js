import { DocumentListPage } from "../DocumentListPage";
import { DocumentDetailPage } from "../DocumentDetailPage";
import { EmptyState } from "../../components/EmptyState";

export function PurchaseOrdersPage() {
  return (
    <DocumentListPage
      kind="purchase_order"
      title="Purchase Orders"
      testId="purchase-orders-table"
      basePath="/purchase/orders"
    />
  );
}

export function PurchaseOrderDetailPage() {
  return <DocumentDetailPage testId="purchase-order" />;
}

export function ReceiptsPage() {
  return (
    <DocumentListPage
      kind="purchase_receipt"
      title="Purchase Receipts"
      testId="purchase-receipts-table"
      basePath="/purchase/receipts"
    />
  );
}

export function ReceiptDetailPage() {
  return <DocumentDetailPage testId="purchase-receipt" />;
}

export function BillsPage() {
  return (
    <DocumentListPage
      kind="vendor_bill"
      title="Vendor Bills"
      testId="purchase-bills-table"
      basePath="/purchase/bills"
    />
  );
}

export function PurchasePaymentsPage() {
  return (
    <DocumentListPage
      kind="vendor_payment"
      title="Vendor Payments"
      testId="purchase-payments-table"
      basePath="/purchase/payments"
    />
  );
}

export function VendorsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Vendors" text="Vendor directory and profiles." /></div></div>;
}
export function PurchaseRequestsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Purchase Requests" text="Internal purchase requisitions." /></div></div>;
}
export function VendorPerformancePage() {
  return <div className="card"><div className="card-body"><EmptyState title="Vendor Performance" text="Supplier scorecards and analytics." /></div></div>;
}
