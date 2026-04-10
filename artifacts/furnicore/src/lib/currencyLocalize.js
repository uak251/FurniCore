/**
 * Format a numeric amount for display using Intl (symbol + grouping).
 * @param amount - raw number in major units (e.g. dollars)
 * @param currencyCode - ISO 4217 (default USD)
 * @param locale - BCP 47 locale (default en-US)
 */
export function currencyLocalize(amount, currencyCode = "USD", locale = "en-US") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Async: convert using backend /currency/convert (ECB rates via Frankfurter). */
export async function currencyConvertDisplay(amount, from, to, apiBase) {
  const base = (apiBase ?? "").replace(/\/$/, "");
  const q = new URLSearchParams({
    amount: String(amount),
    from,
    to,
  });
  const res = await fetch(`${base}/api/currency/convert?${q}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || "Convert failed");
  return { ...json, label: currencyLocalize(json.converted, to) };
}
