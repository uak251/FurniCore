import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";

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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      
      <Route>
        <ProtectedRoute>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/inventory" component={InventoryPage} />
              <Route path="/products" component={ProductsPage} />
              <Route path="/suppliers" component={SuppliersPage} />
              <Route path="/quotes" component={QuotesPage} />
              <Route path="/manufacturing" component={ManufacturingPage} />
              <Route path="/hr" component={HRPage} />
              <Route path="/payroll" component={PayrollPage} />
              <Route path="/accounting" component={AccountingPage} />
              <Route path="/notifications" component={NotificationsPage} />
              <Route path="/activity" component={ActivityPage} />
              <Route path="/users" component={UsersPage} />
              <Route path="/settings" component={SettingsPage} />
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
