import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/lib/auth";
import { CurrencyProvider } from "@/lib/currency";
import { DashboardThemeProvider } from "@/context/DashboardThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { SupplierLayout } from "@/components/SupplierLayout";
import { WorkerLayout } from "@/components/WorkerLayout";
import { CustomerLayout } from "@/components/CustomerLayout";
import { RoleGuard } from "@/components/RoleGuard";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import VerifyEmailPage from "@/pages/verify-email";
import VerifyOtpPage from "@/pages/verify-otp";
import Dashboard from "@/pages/dashboard";
import InventoryPage from "@/pages/inventory";
import ProductsPage from "@/pages/products";
import SuppliersPage from "@/pages/suppliers";
import QuotesPage from "@/pages/quotes";
import ProcurementPage from "@/pages/procurement";
import PriceApprovalsDashboardPage from "@/pages/price-approvals-dashboard";
import CogmReportsPage from "@/pages/cogm-reports";
import InventoryUsagePage from "@/pages/inventory-usage";
import ManufacturingPage from "@/pages/manufacturing";
import HRPage from "@/pages/hr";
import PayrollPage from "@/pages/payroll";
import AccountingPage from "@/pages/accounting";
import NotificationsPage from "@/pages/notifications";
import ActivityPage from "@/pages/activity";
import UsersPage from "@/pages/users";
import SettingsPage from "@/pages/settings";
import PreferencesPage from "@/pages/preferences";
import ProfilePage from "@/pages/profile";
import SupplierPortalPage from "@/pages/supplier-portal";
import WorkerPortalPage from "@/pages/worker-portal";
import CustomerPortalPage from "@/pages/customer-portal";
import { CustomerShopProvider } from "@/contexts/customer-shop-context";
import SalesPage from "@/pages/sales";
import NotFound from "@/pages/not-found";
import ChartOfAccountsPage from "@/pages/chart-of-accounts";
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 30_000,
        },
    },
});
/**
 * Role access matrix — mirrors the nav filter in Layout.jsx.
 *
 *  admin    → all routes
 *  manager  → all except /users and /settings
 *  accountant → finance + ops as gated below
 *  employee → core ops + procurement / COGM pages where listed
 *  inventory_manager → procurement + inventory-heavy routes
 *  sales_manager → /sales + price approvals (customer proposals)
 */
function Router() {
    return (_jsxs(Switch, { children: [
        _jsx(Route, { path: "/login", component: Login }),
        _jsx(Route, { path: "/signup", component: Signup }),
        _jsx(Route, { path: "/verify-email", component: VerifyEmailPage }),
        _jsx(Route, { path: "/verify-otp", component: VerifyOtpPage }),
        _jsx(Route, { path: "/supplier-portal/preferences", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["supplier"], children: _jsx(SupplierLayout, { children: _jsx(PreferencesPage, {}) }) }) }) }),
        _jsx(Route, { path: "/supplier-portal/profile", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["supplier"], children: _jsx(SupplierLayout, { children: _jsx(ProfilePage, {}) }) }) }) }),
        _jsx(Route, { path: "/worker-portal/preferences", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["worker"], children: _jsx(WorkerLayout, { children: _jsx(PreferencesPage, {}) }) }) }) }),
        _jsx(Route, { path: "/worker-portal/profile", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["worker"], children: _jsx(WorkerLayout, { children: _jsx(ProfilePage, {}) }) }) }) }),
        _jsx(Route, { path: "/customer-portal/preferences", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["customer"], children: _jsx(CustomerLayout, { children: _jsx(PreferencesPage, {}) }) }) }) }),
        _jsx(Route, { path: "/customer-portal/profile", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["customer"], children: _jsx(CustomerLayout, { children: _jsx(ProfilePage, {}) }) }) }) }),
        _jsx(Route, { path: "/supplier-portal", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["supplier"], children: _jsx(SupplierLayout, { children: _jsx(SupplierPortalPage, {}) }) }) }) }),
        _jsx(Route, { path: "/worker-portal", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["worker"], children: _jsx(WorkerLayout, { children: _jsx(WorkerPortalPage, {}) }) }) }) }),
        _jsx(Route, { path: "/customer-portal", children: _jsx(ProtectedRoute, { children: _jsx(RoleGuard, { allowedRoles: ["customer"], children: _jsx(CustomerShopProvider, { children: _jsx(CustomerLayout, { children: _jsx(CustomerPortalPage, {}) }) }) }) }) }),
        _jsx(Route, { children: _jsx(ProtectedRoute, { children: _jsx(Layout, { children: _jsxs(Switch, { children: [
            _jsx(Route, { path: "/", component: Dashboard }),
            _jsx(Route, { path: "/inventory", component: InventoryPage }),
            _jsx(Route, { path: "/products", component: ProductsPage }),
            _jsx(Route, { path: "/manufacturing", component: ManufacturingPage }),
            _jsx(Route, { path: "/notifications", component: NotificationsPage }),
            _jsx(Route, { path: "/suppliers", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager", "accountant"], children: _jsx(SuppliersPage, {}) }) }),
            _jsx(Route, { path: "/quotes", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager", "accountant"], children: _jsx(QuotesPage, {}) }) }),
            _jsx(Route, { path: "/procurement", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager", "accountant", "employee", "inventory_manager"], children: _jsx(ProcurementPage, {}) }) }),
            _jsx(Route, { path: "/price-approvals", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager", "accountant", "sales_manager"], children: _jsx(PriceApprovalsDashboardPage, {}) }) }),
            _jsx(Route, { path: "/cogm-reports", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager", "accountant", "employee", "inventory_manager"], children: _jsx(CogmReportsPage, {}) }) }),
            _jsx(Route, { path: "/inventory-usage", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager", "accountant", "employee", "inventory_manager"], children: _jsx(InventoryUsagePage, {}) }) }),
            _jsx(Route, { path: "/sales", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager", "sales_manager"], children: _jsx(SalesPage, {}) }) }),
            _jsx(Route, { path: "/hr", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager"], children: _jsx(HRPage, {}) }) }),
            _jsx(Route, { path: "/payroll", children: _jsx(RoleGuard, { allowedRoles: ["admin", "accountant"], children: _jsx(PayrollPage, {}) }) }),
            _jsx(Route, { path: "/chart-of-accounts", children: _jsx(RoleGuard, { allowedRoles: ["admin", "accountant"], children: _jsx(ChartOfAccountsPage, {}) }) }),
            _jsx(Route, { path: "/accounting", children: _jsx(RoleGuard, { allowedRoles: ["admin", "accountant", "manager"], children: _jsx(AccountingPage, {}) }) }),
            _jsx(Route, { path: "/activity", children: _jsx(RoleGuard, { allowedRoles: ["admin", "manager"], children: _jsx(ActivityPage, {}) }) }),
            _jsx(Route, { path: "/users", children: _jsx(RoleGuard, { allowedRoles: ["admin"], children: _jsx(UsersPage, {}) }) }),
            _jsx(Route, { path: "/settings", children: _jsx(RoleGuard, { allowedRoles: ["admin"], children: _jsx(SettingsPage, {}) }) }),
            _jsx(Route, { path: "/preferences", component: PreferencesPage }),
            _jsx(Route, { path: "/profile", component: ProfilePage }),
            _jsx(Route, { component: NotFound }),
        ] }) }) }) }),
    ] }));
}
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(DashboardThemeProvider, { children: _jsx(CurrencyProvider, { children: _jsxs(TooltipProvider, { children: [_jsx(WouterRouter, { base: import.meta.env.BASE_URL.replace(/\/$/, ""), children: _jsx(Router, {}) }), _jsx(Toaster, {})] }) }) }) }));
}
export default App;
