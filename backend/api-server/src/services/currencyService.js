/**
 * FX rates via Frankfurter API (ECB-based, no API key). Optional DB cache.
 */
import { eq } from "drizzle-orm";
import { db, currencyRatesCacheTable } from "@workspace/db";

const FRANKFURTER = "https://api.frankfurter.app";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchRatesFromApi(base) {
  const url = `${FRANKFURTER}/latest?from=${encodeURIComponent(base)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Frankfurter API ${res.status}`);
  return res.json();
}

export async function getLatestRates(base = "USD") {
  const [cached] = await db
    .select()
    .from(currencyRatesCacheTable)
    .where(eq(currencyRatesCacheTable.baseCurrency, base))
    .limit(1);
  const now = Date.now();
  if (cached && now - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return {
      base: cached.baseCurrency,
      date: new Date(cached.fetchedAt).toISOString().slice(0, 10),
      rates: JSON.parse(cached.ratesJson),
      cached: true,
    };
  }
  const data = await fetchRatesFromApi(base);
  const ratesJson = JSON.stringify(data.rates);
  const fetchedAt = new Date();
  const [existing] = await db
    .select({ id: currencyRatesCacheTable.id })
    .from(currencyRatesCacheTable)
    .where(eq(currencyRatesCacheTable.baseCurrency, base))
    .limit(1);
  if (existing) {
    await db
      .update(currencyRatesCacheTable)
      .set({ ratesJson, fetchedAt })
      .where(eq(currencyRatesCacheTable.id, existing.id));
  } else {
    await db.insert(currencyRatesCacheTable).values({ baseCurrency: base, ratesJson, fetchedAt });
  }
  return {
    base: data.base,
    date: data.date,
    rates: data.rates,
    cached: false,
  };
}

export function convertWithRates(amount, from, to, ratesFromBase) {
  const f = String(from).toUpperCase();
  const t = String(to).toUpperCase();
  if (f === t) return amount;
  if (!ratesFromBase || typeof ratesFromBase !== "object") throw new Error("Invalid rates");
  // rates are from USD base in our default fetch; caller passes rates object for the selected base
  if (f === "USD") {
    const rate = ratesFromBase[t];
    if (rate == null) throw new Error(`No rate for ${t}`);
    return amount * rate;
  }
  if (t === "USD") {
    const rate = ratesFromBase[f];
    if (rate == null) throw new Error(`No rate for ${f}`);
    return amount / rate;
  }
  const toUsd = amount / ratesFromBase[f];
  return toUsd * ratesFromBase[t];
}
