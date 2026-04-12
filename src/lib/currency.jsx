import { jsx as _jsx } from "react/jsx-runtime";
/**
 * ERP-wide currency context.
 *
 * Usage:
 *   const { currency, setCurrency, format } = useCurrency();
 *   format(1234.5)   // → "$1,234.50"  (with selected currency)
 *   format(1234.5, { compact: true })  // → "$1.2K"
 *
 * The selected currency is persisted in localStorage so the preference
 * survives page refreshes. CurrencyProvider should wrap the entire app.
 */
import { createContext, useContext, useState, useCallback } from "react";
export const CURRENCIES = [
    { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US" },
    { code: "EUR", label: "Euro", symbol: "€", locale: "de-DE" },
    { code: "GBP", label: "British Pound", symbol: "£", locale: "en-GB" },
    { code: "PKR", label: "Pakistani Rupee", symbol: "₨", locale: "ur-PK" },
    { code: "SAR", label: "Saudi Riyal", symbol: "﷼", locale: "ar-SA" },
    { code: "AED", label: "UAE Dirham", symbol: "د.إ", locale: "ar-AE" },
    { code: "INR", label: "Indian Rupee", symbol: "₹", locale: "hi-IN" },
    { code: "CAD", label: "Canadian Dollar", symbol: "C$", locale: "en-CA" },
    { code: "AUD", label: "Australian Dollar", symbol: "A$", locale: "en-AU" },
    { code: "JPY", label: "Japanese Yen", symbol: "¥", locale: "ja-JP" },
    { code: "CNY", label: "Chinese Yuan", symbol: "¥", locale: "zh-CN" },
    { code: "TRY", label: "Turkish Lira", symbol: "₺", locale: "tr-TR" },
    { code: "CHF", label: "Swiss Franc", symbol: "Fr", locale: "de-CH" },
    { code: "KWD", label: "Kuwaiti Dinar", symbol: "KD", locale: "ar-KW" },
];
const LS_KEY = "furnicore_currency";
const DEFAULT_CODE = "USD";
const CurrencyContext = createContext(null);
/* ─── Provider ─────────────────────────────────────────────────────────────── */
export function CurrencyProvider({ children }) {
    const [code, setCode] = useState(() => {
        const stored = localStorage.getItem(LS_KEY);
        return stored && CURRENCIES.some((c) => c.code === stored) ? stored : DEFAULT_CODE;
    });
    const currency = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
    const setCurrency = useCallback((newCode) => {
        const def = CURRENCIES.find((c) => c.code === newCode);
        if (!def)
            return;
        localStorage.setItem(LS_KEY, newCode);
        setCode(newCode);
    }, []);
    const format = useCallback((amount, opts = {}) => {
        const { compact = false, plain = false, decimals } = opts;
        const noFraction = ["JPY", "KWD"].includes(currency.code) && decimals === undefined;
        const fractionDigits = decimals ?? (noFraction ? 0 : 2);
        if (plain) {
            return new Intl.NumberFormat(currency.locale, {
                minimumFractionDigits: fractionDigits,
                maximumFractionDigits: fractionDigits,
                notation: compact ? "compact" : "standard",
                compactDisplay: "short",
            }).format(amount);
        }
        return new Intl.NumberFormat(currency.locale, {
            style: "currency",
            currency: currency.code,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
            notation: compact ? "compact" : "standard",
            compactDisplay: "short",
        }).format(amount);
    }, [currency]);
    return (_jsx(CurrencyContext.Provider, { value: { currency, setCurrency, format }, children: children }));
}
/* ─── Hook ─────────────────────────────────────────────────────────────────── */
export function useCurrency() {
    const ctx = useContext(CurrencyContext);
    if (!ctx)
        throw new Error("useCurrency must be used inside <CurrencyProvider>");
    return ctx;
}
