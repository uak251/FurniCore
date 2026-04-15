const routeLoaders = {
  "/": () => import("@/pages/dashboard"),
  "/inventory": () => import("@/pages/inventory"),
  "/products": () => import("@/pages/products"),
  "/suppliers": () => import("@/pages/suppliers"),
  "/quotes": () => import("@/pages/quotes"),
  "/procurement": () => import("@/pages/procurement"),
  "/price-approvals": () => import("@/pages/price-approvals-dashboard"),
  "/cogm-reports": () => import("@/pages/cogm-reports"),
  "/inventory-usage": () => import("@/pages/inventory-usage"),
  "/manufacturing": () => import("@/pages/manufacturing"),
  "/sales": () => import("@/pages/sales"),
  "/hr": () => import("@/pages/hr"),
  "/payroll": () => import("@/pages/payroll"),
  "/accounting": () => import("@/pages/accounting"),
  "/chart-of-accounts": () => import("@/pages/chart-of-accounts"),
  "/notifications": () => import("@/pages/notifications"),
  "/activity": () => import("@/pages/activity"),
  "/users": () => import("@/pages/users"),
  "/settings": () => import("@/pages/settings"),
  "/preferences": () => import("@/pages/preferences"),
  "/profile": () => import("@/pages/profile"),
  "/supplier-portal": () => import("@/pages/supplier-portal"),
  "/worker-portal": () => import("@/pages/worker-portal"),
  "/customer-portal": () => import("@/pages/customer-portal"),
  "/customer-portal/orders": () => import("@/pages/customer-orders"),
  "/customer-portal/payments": () => import("@/pages/customer-payments"),
  "/customer-portal/activity": () => import("@/pages/customer-analytics"),
};

const preloaded = new Set();

export function preloadRoute(path) {
  const loader = routeLoaders[path];
  if (!loader || preloaded.has(path)) return;
  preloaded.add(path);
  void loader();
}

