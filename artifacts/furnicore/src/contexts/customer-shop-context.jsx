import { createContext, useContext, useMemo, useState } from "react";

export const CustomerShopContext = createContext(null);

export function CustomerShopProvider({ children }) {
    const [cart, setCart] = useState([]);
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const value = useMemo(
        () => ({
            cart,
            setCart,
            cartCount: cart.reduce((s, item) => s + item.quantity, 0),
            categoryFilter,
            setCategoryFilter,
            searchQuery,
            setSearchQuery,
        }),
        [cart, categoryFilter, searchQuery],
    );
    return <CustomerShopContext.Provider value={value}>{children}</CustomerShopContext.Provider>;
}

export function useCustomerShop() {
    const ctx = useContext(CustomerShopContext);
    if (!ctx) throw new Error("useCustomerShop must be used within CustomerShopProvider");
    return ctx;
}
