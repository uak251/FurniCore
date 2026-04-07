import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { SupplierLayout } from "@/components/SupplierLayout";
import { WorkerLayout } from "@/components/WorkerLayout";
import { RoleGuard } from "@/components/RoleGuard";

import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Dashboard from "@/pages/dashboard";
import InventoryPage from "@/pages/inventory";
import ProductsPage from "@/pages/products";
import SuppliersPage from "@/pages/suppliers";
import QuotesPage from "@/pages/quotes";
import ManufacturingPage from "@/pages/manufacturing";
import HRPage from "@/pages/hr";
import PayrollPage from "@/pages/payroll";
import AccountingPage from "@/pages/accounting";
import NotificationsPage from "@/pages/notifications";
import ActivityPage from "@/pages/activity";
import UsersPage from "@/pages/users";
import SettingsPage from "@/pages/settings";
import SupplierPortalPage from "@/pages/supplier-portal";
import WorkerPortalPage from "@/pages/worker-portal";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Role access matrix — mirrors the nav filter in Layout.tsx.
 * Both must stay in sync when roles change.
 *
 *  admin    → all routes
 *  manager  → all except /users and /settings
 *  accounts → finance routes only
 *  employee → core ops (dashboard, inventory, products, manufacturing, notifications)
 *  supplier → /supplier-portal only (isolated shell, no internal nav)
 *  worker   → /worker-portal only  (isolated shell, no internal nav)
 */
function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />

      {/* ── Supplier portal — isolated layout, no internal modules ── */}
      <Route path="/supplier-portal">
        <ProtectedRoute>
          <RoleGuard allowedRoles={["supplier"]}>
            <SupplierLayout>
              <SupplierPortalPage />
            </SupplierLayout>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      {/* ── Worker portal — isolated layout, own data only ── */}
      <Route path="/worker-portal">
        <ProtectedRoute>
          <RoleGuard allowedRoles={["worker"]}>
            <WorkerLayout>
              <WorkerPortalPage />
            </WorkerLayout>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route>
        <ProtectedRoute>
          <Layout>
            <Switch>
              {/* ── Accessible to all internal authenticated roles ── */}
              <Route path="/" component={Dashboard} />
              <Route path="/inventory" component={InventoryPage} />
              <Route path="/products" component={ProductsPage} />
              <Route path="/manufacturing" component={ManufacturingPage} />
              <Route path="/notifications" component={NotificationsPage} />

              {/* ── Suppliers & Quotes: internal staff only ── */}
              <Route path="/suppliers">
                <RoleGuard allowedRoles={["admin", "manager", "accounts"]}>
                  <SuppliersPage />
                </RoleGuard>
              </Route>
              <Route path="/quotes">
                <RoleGuard allowedRoles={["admin", "manager", "accounts"]}>
                  <QuotesPage />
                </RoleGuard>
              </Route>

              {/* ── HR: admin / manager ── */}
              <Route path="/hr">
                <RoleGuard allowedRoles={["admin", "manager"]}>
                  <HRPage />
                </RoleGuard>
              </Route>

              {/* ── Payroll: admin / accounts ── */}
              <Route path="/payroll">
                <RoleGuard allowedRoles={["admin", "accounts"]}>
                  <PayrollPage />
                </RoleGuard>
              </Route>

              {/* ── Accounting: admin / accounts / manager ── */}
              <Route path="/accounting">
                <RoleGuard allowedRoles={["admin", "accounts", "manager"]}>
                  <AccountingPage />
                </RoleGuard>
              </Route>

              {/* ── Activity log: admin / manager ── */}
              <Route path="/activity">
                <RoleGuard allowedRoles={["admin", "manager"]}>
                  <ActivityPage />
                </RoleGuard>
              </Route>

              {/* ── User management: admin only ── */}
              <Route path="/users">
                <RoleGuard allowedRoles={["admin"]}>
                  <UsersPage />
                </RoleGuard>
              </Route>

              {/* ── Settings: admin only ── */}
              <Route path="/settings">
                <RoleGuard allowedRoles={["admin"]}>
                  <SettingsPage />
                </RoleGuard>
              </Route>

              <Route component={NotFound} />
            </Switch>
          </Layout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
