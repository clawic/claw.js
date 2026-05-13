import { createBrowserRouter, Navigate } from "react-router-dom";
import { Shell } from "./components/Shell";

// Dashboard
import { DashboardPage } from "./pages/Dashboard";

// Finance
import { AccountsPage } from "./pages/finance/Accounts";
import { EntriesPage } from "./pages/finance/Entries";
import { EntryDetailPage } from "./pages/finance/EntryDetail";
import { PeriodsPage } from "./pages/finance/Periods";
import { FinanceIndex, JournalsPage, TaxesPage, BanksPage, ReconciliationPage, AssetsPage, PeriodClosePage } from "./pages/finance/index";

// Sales
import { QuotesPage, QuoteCreatePage, QuoteDetailPage, OrdersPage, OrderDetailPage, ShipmentsPage, InvoicesPage, InvoiceDetailPage, LeadsPage, OpportunitiesPage, SalesAccountsPage, ContactsPage, SubscriptionsPage } from "./pages/sales/index";

// Purchase
import { PurchaseOrdersPage, PurchaseOrderDetailPage, ReceiptsPage, ReceiptDetailPage, BillsPage, PurchasePaymentsPage, VendorsPage, PurchaseRequestsPage, VendorPerformancePage } from "./pages/purchase/index";

// Inventory
import { ItemsPage, BalancesPage, VariantsPage, UomPage, LotsPage, SerialsPage, WarehousesPage, LocationsPage, MovementsPage, ValuationPage, CountsPage, ReorderRulesPage } from "./pages/inventory/index";

// MRP
import { MrpOrdersPage, MrpOrderDetailPage, BomsPage, RoutingsPage, WorkCentersPage, ConsumptionPage, ProductionPage, QualityPage, MaintenancePage } from "./pages/mrp/index";

// Projects
import { ProjectsListPage, PortfolioPage, TasksPage, MilestonesPage, TimesheetsPage, ProfitabilityPage, BillingPage } from "./pages/projects/index";

// HR
import { EmployeesPage, StructurePage, ContractsPage, LeavePage, AttendancePage, HrDocumentsPage, ReviewsPage } from "./pages/hr/index";

// Payroll
import { PayrollRunsPage, PayrollRunDetailPage, PayrollCalendarPage, PayslipsPage, IncidentsPage, PostingsPage, PayrollClosePage } from "./pages/payroll/index";

// Support
import { QueuePage, TicketsPage, TicketDetailPage, SlaPage, MacrosPage, KnowledgeLinksPage } from "./pages/support/index";

// DMS
import { LibrariesPage, DmsDocumentsPage, VersionsPage, DmsPermissionsPage, SignaturesPage, RetentionPage } from "./pages/dms/index";

// BI
import { BiDashboardsPage, MetricsPage, ViewsPage, DrilldownPage, ExportPage } from "./pages/bi/index";

// Admin
import { ApprovalsPage, AuditPage, UsersPage, RolesPage, PoliciesPage, LocalizationsPage, NumberingPage, TemplatesPage, IntegrationsPage, AgentsPage, SettingsPage } from "./pages/admin/index";

export function createAppRouter(onLogout: () => void) {
  return createBrowserRouter([
    {
      path: "/",
      element: <Shell onLogout={onLogout} />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },

        // Dashboard
        { path: "dashboard", element: <DashboardPage /> },

        // Finance
        { path: "finance", element: <FinanceIndex /> },
        { path: "modules/finance/accounts", element: <AccountsPage /> },
        { path: "modules/finance/journals", element: <JournalsPage /> },
        { path: "modules/finance/entries", element: <EntriesPage /> },
        { path: "modules/finance/entries/:entryId", element: <EntryDetailPage /> },
        { path: "modules/finance/periods", element: <PeriodsPage /> },
        { path: "modules/finance/taxes", element: <TaxesPage /> },
        { path: "modules/finance/banks", element: <BanksPage /> },
        { path: "modules/finance/reconciliation", element: <ReconciliationPage /> },
        { path: "modules/finance/assets", element: <AssetsPage /> },
        { path: "modules/finance/close", element: <PeriodClosePage /> },

        // Sales
        { path: "sales", element: <Navigate to="/sales/quotes" replace /> },
        { path: "sales/leads", element: <LeadsPage /> },
        { path: "sales/opportunities", element: <OpportunitiesPage /> },
        { path: "sales/accounts", element: <SalesAccountsPage /> },
        { path: "sales/contacts", element: <ContactsPage /> },
        { path: "sales/quotes", element: <QuotesPage /> },
        { path: "sales/quotes/create", element: <QuoteCreatePage /> },
        { path: "sales/quotes/:id", element: <QuoteDetailPage /> },
        { path: "sales/orders", element: <OrdersPage /> },
        { path: "sales/orders/:id", element: <OrderDetailPage /> },
        { path: "sales/shipments", element: <ShipmentsPage /> },
        { path: "sales/invoices", element: <InvoicesPage /> },
        { path: "sales/invoices/:id", element: <InvoiceDetailPage /> },
        { path: "sales/subscriptions", element: <SubscriptionsPage /> },

        // Purchase
        { path: "purchase", element: <Navigate to="/purchase/orders" replace /> },
        { path: "purchase/vendors", element: <VendorsPage /> },
        { path: "purchase/requests", element: <PurchaseRequestsPage /> },
        { path: "purchase/orders", element: <PurchaseOrdersPage /> },
        { path: "purchase/orders/:id", element: <PurchaseOrderDetailPage /> },
        { path: "purchase/receipts", element: <ReceiptsPage /> },
        { path: "purchase/receipts/:id", element: <ReceiptDetailPage /> },
        { path: "purchase/bills", element: <BillsPage /> },
        { path: "purchase/payments", element: <PurchasePaymentsPage /> },
        { path: "purchase/vendor-performance", element: <VendorPerformancePage /> },

        // Inventory
        { path: "inventory", element: <Navigate to="/inventory/items" replace /> },
        { path: "inventory/items", element: <ItemsPage /> },
        { path: "inventory/variants", element: <VariantsPage /> },
        { path: "inventory/uom", element: <UomPage /> },
        { path: "inventory/lots", element: <LotsPage /> },
        { path: "inventory/serials", element: <SerialsPage /> },
        { path: "inventory/warehouses", element: <WarehousesPage /> },
        { path: "inventory/locations", element: <LocationsPage /> },
        { path: "inventory/movements", element: <MovementsPage /> },
        { path: "inventory/valuation", element: <ValuationPage /> },
        { path: "inventory/counts", element: <CountsPage /> },
        { path: "inventory/reorder-rules", element: <ReorderRulesPage /> },

        // MRP
        { path: "mrp", element: <Navigate to="/mrp/orders" replace /> },
        { path: "mrp/boms", element: <BomsPage /> },
        { path: "mrp/routings", element: <RoutingsPage /> },
        { path: "mrp/work-centers", element: <WorkCentersPage /> },
        { path: "mrp/orders", element: <MrpOrdersPage /> },
        { path: "mrp/orders/:id", element: <MrpOrderDetailPage /> },
        { path: "mrp/consumption", element: <ConsumptionPage /> },
        { path: "mrp/production", element: <ProductionPage /> },
        { path: "mrp/quality", element: <QualityPage /> },
        { path: "mrp/maintenance", element: <MaintenancePage /> },

        // Projects
        { path: "projects", element: <Navigate to="/projects/list" replace /> },
        { path: "projects/portfolio", element: <PortfolioPage /> },
        { path: "projects/list", element: <ProjectsListPage /> },
        { path: "projects/tasks", element: <TasksPage /> },
        { path: "projects/milestones", element: <MilestonesPage /> },
        { path: "projects/timesheets", element: <TimesheetsPage /> },
        { path: "projects/profitability", element: <ProfitabilityPage /> },
        { path: "projects/billing", element: <BillingPage /> },

        // HR
        { path: "hr", element: <Navigate to="/hr/employees" replace /> },
        { path: "hr/employees", element: <EmployeesPage /> },
        { path: "hr/structure", element: <StructurePage /> },
        { path: "hr/contracts", element: <ContractsPage /> },
        { path: "hr/leave", element: <LeavePage /> },
        { path: "hr/attendance", element: <AttendancePage /> },
        { path: "hr/documents", element: <HrDocumentsPage /> },
        { path: "hr/reviews", element: <ReviewsPage /> },

        // Payroll
        { path: "payroll", element: <Navigate to="/payroll/runs" replace /> },
        { path: "payroll/calendar", element: <PayrollCalendarPage /> },
        { path: "payroll/runs", element: <PayrollRunsPage /> },
        { path: "payroll/runs/:id", element: <PayrollRunDetailPage /> },
        { path: "payroll/payslips", element: <PayslipsPage /> },
        { path: "payroll/incidents", element: <IncidentsPage /> },
        { path: "payroll/postings", element: <PostingsPage /> },
        { path: "payroll/close", element: <PayrollClosePage /> },

        // Support
        { path: "support", element: <Navigate to="/support/queue" replace /> },
        { path: "support/queue", element: <QueuePage /> },
        { path: "support/tickets", element: <TicketsPage /> },
        { path: "support/tickets/:id", element: <TicketDetailPage /> },
        { path: "support/sla", element: <SlaPage /> },
        { path: "support/macros", element: <MacrosPage /> },
        { path: "support/knowledge-links", element: <KnowledgeLinksPage /> },

        // DMS
        { path: "dms", element: <Navigate to="/dms/libraries" replace /> },
        { path: "dms/libraries", element: <LibrariesPage /> },
        { path: "dms/documents", element: <DmsDocumentsPage /> },
        { path: "dms/versions", element: <VersionsPage /> },
        { path: "dms/permissions", element: <DmsPermissionsPage /> },
        { path: "dms/signatures", element: <SignaturesPage /> },
        { path: "dms/retention", element: <RetentionPage /> },

        // BI
        { path: "bi", element: <Navigate to="/bi/dashboards" replace /> },
        { path: "bi/dashboards", element: <BiDashboardsPage /> },
        { path: "bi/metrics", element: <MetricsPage /> },
        { path: "bi/views", element: <ViewsPage /> },
        { path: "bi/drilldown", element: <DrilldownPage /> },
        { path: "bi/export", element: <ExportPage /> },

        // Admin
        { path: "admin", element: <Navigate to="/admin/users" replace /> },
        { path: "admin/users", element: <UsersPage /> },
        { path: "admin/roles", element: <RolesPage /> },
        { path: "admin/policies", element: <PoliciesPage /> },
        { path: "admin/localizations", element: <LocalizationsPage /> },
        { path: "admin/numbering", element: <NumberingPage /> },
        { path: "admin/templates", element: <TemplatesPage /> },
        { path: "admin/integrations", element: <IntegrationsPage /> },
        { path: "admin/agents", element: <AgentsPage /> },
        { path: "admin/settings", element: <SettingsPage /> },
        { path: "admin/approvals", element: <ApprovalsPage /> },
        { path: "admin/audit", element: <AuditPage /> },
      ],
    },
  ]);
}
