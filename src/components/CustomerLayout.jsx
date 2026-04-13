import { Link, useLocation } from "wouter";
import { useLogout, useGetCurrentUser } from "@workspace/api-client-react";
import { clearAuthStorage } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";
import {
    LogOut,
    ShoppingBag,
    Search,
    ShoppingCart,
    Leaf,
    MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileNavButton } from "@/components/ProfileNavButton";
import { profilePathForRole } from "@/lib/profile-path";
import { ThemeSwitcher } from "@/components/dashboard/ThemeSwitcher";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { useCustomerStorefront } from "@/hooks/use-customer-portal";
import { useContext } from "react";
import { CustomerShopContext } from "@/contexts/customer-shop-context";
import { cn } from "@/lib/utils";
import { NativeAnalyticsPanel } from "@/components/NativeAnalyticsPanel";

function useShopOptional() {
    return useContext(CustomerShopContext);
}

/**
 * Storefront shell: wide layout, category nav, search synced to shop context when present.
 */
export function CustomerLayout({ children }) {
    const [, setLocation] = useLocation();
    const logout = useLogout();
    const { data: user } = useGetCurrentUser();
    const shop = useShopOptional();
    const { data: storefront } = useCustomerStorefront({ enabled: Boolean(user?.role === "customer") });

    const handleLogout = async () => {
        try {
            await logout.mutateAsync();
        } catch {
            /* ignore */
        } finally {
            disconnectSocket();
            clearAuthStorage();
            setLocation("/login");
        }
    };

    const cartCount = shop?.cartCount ?? 0;
    const searchQuery = shop?.searchQuery ?? "";
    const setSearchQuery = shop?.setSearchQuery;
    const setCategoryFilter = shop?.setCategoryFilter;

    const scrollToShop = () => {
        document.getElementById("shop-all")?.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <div className="flex min-h-screen flex-col bg-[#faf9f7] dark:bg-background">
            <header className="sticky top-0 z-50 border-b border-amber-200/60 bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link href="/customer-portal" className="flex items-center gap-2 no-underline">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-800 text-primary-foreground shadow">
                                <Leaf className="h-5 w-5" aria-hidden />
                            </span>
                            <span className="text-xl font-semibold tracking-tight text-emerald-900 dark:text-emerald-100">
                                FurniCore
                            </span>
                        </Link>
                        {storefront?.announcement && (
                            <button
                                type="button"
                                onClick={scrollToShop}
                                className="hidden rounded-md bg-orange-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-orange-600 sm:inline-flex"
                            >
                                {storefront.announcement.label}
                            </button>
                        )}
                        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
                            <div className="relative min-w-[140px] max-w-xs flex-1">
                                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search furniture…"
                                    className="h-9 border-emerald-900/15 bg-background pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery?.(e.target.value)}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="relative shrink-0 border-emerald-900/20"
                                onClick={scrollToShop}
                                aria-label="Shopping cart"
                            >
                                <ShoppingCart className="h-4 w-4" />
                                {cartCount > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                        {cartCount > 99 ? "99+" : cartCount}
                                    </span>
                                )}
                            </Button>
                            <Button variant="ghost" size="sm" className="hidden text-muted-foreground lg:inline-flex" asChild>
                                <Link href="/customer-portal/preferences">Appearance</Link>
                            </Button>
                            <ThemeSwitcher />
                            <ProfileNavButton href={profilePathForRole(user?.role)} />
                            <NotificationBell />
                            {user && (
                                <div className="hidden items-center gap-2 sm:flex">
                                    {user.profileImageUrl ? (
                                        <img
                                            src={resolvePublicAssetUrl(user.profileImageUrl)}
                                            alt=""
                                            className="h-7 w-7 rounded-full object-cover ring-1 ring-emerald-900/20"
                                        />
                                    ) : (
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-900/10 text-xs font-semibold text-emerald-900">
                                            {user.name?.charAt(0).toUpperCase() ?? "C"}
                                        </div>
                                    )}
                                    <div className="text-right leading-tight">
                                        <p className="text-xs font-medium">{user.name}</p>
                                        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                            <ShoppingBag className="h-3 w-3" aria-hidden />
                                            Customer
                                        </p>
                                    </div>
                                </div>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={handleLogout}
                            >
                                <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
                                <span className="hidden sm:inline">Log out</span>
                            </Button>
                        </div>
                    </div>
                    {storefront?.collections && storefront.collections.length > 0 && (
                        <nav
                            className="flex flex-wrap items-center gap-1 border-t border-amber-200/40 pt-2 text-sm"
                            aria-label="Collections"
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setCategoryFilter?.("all");
                                    scrollToShop();
                                }}
                                className={cn(
                                    "rounded-full px-3 py-1 font-medium transition hover:bg-emerald-900/10",
                                    shop?.categoryFilter === "all" && "bg-emerald-900/15 text-emerald-900",
                                )}
                            >
                                All
                            </button>
                            {storefront.collections.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                        setCategoryFilter?.(c.name);
                                        scrollToShop();
                                    }}
                                    className={cn(
                                        "rounded-full px-3 py-1 font-medium transition hover:bg-emerald-900/10",
                                        shop?.categoryFilter === c.name && "bg-emerald-900/15 text-emerald-900",
                                    )}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </nav>
                    )}
                </div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 overflow-auto">
                <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-10">
                    <NativeAnalyticsPanel moduleKey="customer" title="Customer Dashboard Analytics" />
                    {children}
                </div>
            </main>
            <footer className="border-t bg-card px-4 py-4 text-center text-xs text-muted-foreground md:px-8">
                FurniCore · Quality furniture · Secure checkout · Questions?{" "}
                <a href="mailto:support@furnicore.local" className="text-emerald-800 underline dark:text-emerald-400">
                    Contact us
                </a>
            </footer>
            <a
                href="https://wa.me/"
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
                aria-label="WhatsApp"
            >
                <MessageCircle className="h-6 w-6" />
            </a>
        </div>
    );
}
