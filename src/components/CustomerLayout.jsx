import { Link, useLocation } from "wouter";
import { useLogout, useGetCurrentUser } from "@workspace/api-client-react";
import { clearAuthStorage } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";
import {
    LogOut,
    ShoppingBag,
    Search,
    ShoppingCart,
    Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileNavButton } from "@/components/ProfileNavButton";
import { profilePathForRole } from "@/lib/profile-path";
import { ThemeSwitcher } from "@/components/dashboard/ThemeSwitcher";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { useCustomerStorefront } from "@/hooks/use-customer-portal";
import { useContext, useMemo } from "react";
import { CustomerShopContext } from "@/contexts/customer-shop-context";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { GlobalCommandPalette } from "@/components/navigation/GlobalCommandPalette";
import { preloadRoute } from "@/lib/route-preload";

function useShopOptional() {
    return useContext(CustomerShopContext);
}

/**
 * Storefront shell: wide layout, category nav, search synced to shop context when present.
 */
export function CustomerLayout({ children }) {
    const [location, setLocation] = useLocation();
    const logout = useLogout();
    const { data: user } = useGetCurrentUser();
    const shop = useShopOptional();
    const { data: storefront } = useCustomerStorefront({ enabled: Boolean(user?.role === "customer") });
    const salesPhone = String(storefront?.salesContact?.phone ?? "").replace(/[^\d+]/g, "");
    const salesEmail = String(storefront?.salesContact?.email ?? "").trim();
    const waNumber = salesPhone.replace(/^\+/, "");
    const whatsappHref = waNumber
        ? `https://wa.me/${waNumber}?text=${encodeURIComponent("Hi, I need help with my FurniCore order.")}`
        : "";
    const supportMailHref = salesEmail
        ? `mailto:${salesEmail}?subject=${encodeURIComponent("FurniCore — customer question")}`
        : "mailto:support@furnicore.local?subject=FurniCore%20question";
    const supportHref = whatsappHref || supportMailHref;
    const supportIsWhatsApp = Boolean(whatsappHref);

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
    const customerNav = useMemo(() => [
        { href: "/customer-portal", label: "Dashboard" },
        { href: "/customer-portal/orders", label: "Orders" },
        { href: "/customer-portal/activity", label: "Analytics" },
        { href: "/customer-portal/payments", label: "Payments" },
        { href: "/customer-portal/profile", label: "Profile" },
    ], []);
    const customerCommandItems = useMemo(() => customerNav.map((item) => ({
        ...item,
        group: "Customer Portal",
        keywords: `${item.label} customer`,
    })), [customerNav]);

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="sticky top-0 z-50 border-b border-amber-200/60 bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-4 md:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                        <Link href="/customer-portal" className="flex items-center gap-2 no-underline">
                            <BrandLogo
                                imageClassName="h-10 w-10 rounded-lg object-contain shadow-sm"
                                showWordmark
                                wordmarkClassName="text-emerald-950 dark:text-emerald-100"
                            />
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
                        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-1 sm:gap-3">
                            <div className="relative min-w-0 flex-1 sm:max-w-xs">
                                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search furniture…"
                                    className="h-10 border-emerald-900/15 bg-background pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery?.(e.target.value)}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="touch-target relative h-10 w-10 shrink-0 border-emerald-900/20"
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
                            <Button variant="ghost" size="sm" className="hidden h-10 text-muted-foreground lg:inline-flex" asChild>
                                <Link href="/customer-portal/preferences">Appearance</Link>
                            </Button>
                            <GlobalCommandPalette
                                items={customerCommandItems}
                                triggerLabel="Jump"
                                className="hidden h-10 lg:inline-flex"
                            />
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
                                className="touch-target h-10 text-muted-foreground hover:text-foreground"
                                onClick={handleLogout}
                            >
                                <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
                                <span className="hidden sm:inline">Log out</span>
                            </Button>
                        </div>
                    </div>
                    <nav className="hide-scrollbar flex items-center gap-2 overflow-x-auto border-t border-amber-200/40 pt-2 text-sm" aria-label="Client portal">
                        {customerNav.map((item) => {
                            const isActive = location === item.href || (item.href !== "/customer-portal" && location.startsWith(item.href));
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onMouseEnter={() => preloadRoute(item.href)}
                                    className={cn(
                                        "whitespace-nowrap rounded-full px-3 py-2 font-medium transition",
                                        isActive
                                            ? "bg-emerald-900 text-white shadow-sm"
                                            : "text-emerald-900 hover:bg-emerald-900/10 dark:text-emerald-100 dark:hover:bg-emerald-100/10",
                                    )}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                    {storefront?.collections && storefront.collections.length > 0 && (
                        <nav
                            className="hide-scrollbar flex items-center gap-1 overflow-x-auto border-t border-amber-200/40 pt-2 text-sm"
                            aria-label="Collections"
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setCategoryFilter?.("all");
                                    scrollToShop();
                                }}
                                className={cn(
                                    "whitespace-nowrap rounded-full px-3 py-2 font-medium transition hover:bg-emerald-900/10",
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
                                        "whitespace-nowrap rounded-full px-3 py-2 font-medium transition hover:bg-emerald-900/10",
                                        shop?.categoryFilter === c.name && "bg-emerald-900/15 text-emerald-900",
                                    )}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </nav>
                    )}
                    <div className="flex flex-wrap items-center gap-2 border-t border-amber-200/40 pt-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full bg-emerald-900/10 px-2 py-1 font-medium text-emerald-900 dark:text-emerald-200">Secure checkout</span>
                        <span className="rounded-full bg-blue-900/10 px-2 py-1 font-medium text-blue-900 dark:text-blue-200">Live order tracking</span>
                        <span className="rounded-full bg-amber-900/10 px-2 py-1 font-medium text-amber-900 dark:text-amber-200">Dedicated support</span>
                    </div>
                </div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 overflow-auto">
                <div className="saas-shell min-w-0 space-y-5 py-5 md:space-y-6 md:py-10">
                    {children}
                </div>
            </main>
            <footer className="border-t bg-card px-4 py-4 text-center text-xs text-muted-foreground md:px-8">
                FurniCore · Quality furniture · Secure checkout · Questions?{" "}
                <a href="mailto:support@furnicore.local" className="text-emerald-800 underline dark:text-emerald-400">
                    Contact us
                </a>
            </footer>
            <Tooltip>
                <TooltipTrigger asChild>
                    <a
                        href={supportHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-3 py-3 text-white shadow-lg transition hover:scale-[1.02] sm:px-4",
                            supportIsWhatsApp ? "bg-[#25D366] hover:bg-[#1ebe5b]" : "bg-emerald-800 hover:bg-emerald-900",
                        )}
                        aria-label={supportIsWhatsApp ? "Message sales on WhatsApp" : "Email sales"}
                    >
                        {supportIsWhatsApp ? (
                            <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" aria-hidden fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                            </svg>
                        ) : (
                            <Mail className="h-6 w-6 shrink-0" aria-hidden />
                        )}
                        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:inline">
                            {supportIsWhatsApp ? "WhatsApp" : "Email us"}
                        </span>
                    </a>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs">
                    {supportIsWhatsApp
                        ? "Chat with our sales team on WhatsApp — typical reply during business hours."
                        : salesEmail
                            ? `No phone on file — opens email to ${salesEmail}.`
                            : "Contact sales by email."}
                </TooltipContent>
            </Tooltip>
        </div>
    );
}
