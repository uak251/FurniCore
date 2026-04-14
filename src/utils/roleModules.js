import {
  Boxes,
  ClipboardList,
  Factory,
  ShoppingCart,
  Users,
  Receipt,
  BarChart3,
  UserRound,
  Truck,
  CalendarCheck,
  Banknote,
  BookOpen,
  FileText,
} from "lucide-react";

export function normalizeRole(role) {
  const raw = String(role || "").toLowerCase();
  if (raw === "sales_manager") return "sales";
  if (raw === "hr_manager") return "hr";
  if (raw === "inventory_manager") return "manager";
  if (raw === "accountant") return "accountant";
  if (raw === "manager") return "manager";
  if (raw === "admin") return "admin";
  return "";
}

export const ROLE_MODULES = {
  admin: [
    { key: "inventory", label: "Inventory", href: "/inventory", icon: Boxes, analyticsModule: "inventory" },
    { key: "procurement", label: "Procurement", href: "/procurement", icon: ClipboardList, analyticsModule: "procurement" },
    { key: "production", label: "Production", href: "/manufacturing", icon: Factory, analyticsModule: "production" },
    { key: "sales", label: "Sales", href: "/sales", icon: ShoppingCart, analyticsModule: "customer" },
    { key: "hr", label: "HR", href: "/hr", icon: Users, analyticsModule: "hr" },
    { key: "accounting", label: "Accounting", href: "/accounting", icon: Receipt, analyticsModule: "accounting" },
  ],
  manager: [
    { key: "inventory", label: "Inventory", href: "/inventory", icon: Boxes, analyticsModule: "inventory" },
    { key: "procurement", label: "Procurement", href: "/procurement", icon: ClipboardList, analyticsModule: "procurement" },
    { key: "production", label: "Production", href: "/manufacturing", icon: Factory, analyticsModule: "production" },
    { key: "analytics", label: "Analytics", href: "/", icon: BarChart3, analyticsModule: "notifications" },
  ],
  sales: [
    { key: "customers", label: "Customers", href: "/customer-portal", icon: UserRound, analyticsModule: "customer" },
    { key: "orders", label: "Orders", href: "/sales", icon: ShoppingCart, analyticsModule: "customer" },
    { key: "delivery", label: "Delivery", href: "/sales", icon: Truck, analyticsModule: "customer" },
  ],
  hr: [
    { key: "employees", label: "Employees", href: "/hr", icon: Users, analyticsModule: "hr" },
    { key: "attendance", label: "Attendance", href: "/hr", icon: CalendarCheck, analyticsModule: "hr" },
    { key: "payroll", label: "Payroll", href: "/payroll", icon: Banknote, analyticsModule: "payroll" },
  ],
  accountant: [
    { key: "transactions", label: "Transactions", href: "/accounting", icon: Receipt, analyticsModule: "accounting" },
    { key: "reports", label: "Reports", href: "/accounting", icon: FileText, analyticsModule: "finance" },
    { key: "ledger", label: "Ledger", href: "/chart-of-accounts", icon: BookOpen, analyticsModule: "accounting" },
  ],
};

export function modulesForRole(role) {
  const normalized = normalizeRole(role);
  return ROLE_MODULES[normalized] ?? [];
}
