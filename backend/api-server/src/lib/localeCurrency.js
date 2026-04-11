/**
 * Infer ISO 4217 currency from country name (free text) or Accept-Language.
 * Used for customer "locality" default — separate from explicit preferred currency override.
 */

/** Lowercased country / region name → currency (common mappings). */
const COUNTRY_HINT_TO_CCY = {
  india: "INR",
  pakistan: "PKR",
  "united states": "USD",
  usa: "USD",
  "united kingdom": "GBP",
  uk: "GBP",
  england: "GBP",
  germany: "EUR",
  france: "EUR",
  italy: "EUR",
  spain: "EUR",
  netherlands: "EUR",
  belgium: "EUR",
  austria: "EUR",
  ireland: "EUR",
  portugal: "EUR",
  finland: "EUR",
  greece: "EUR",
  canada: "CAD",
  australia: "AUD",
  japan: "JPY",
  china: "CNY",
  "south korea": "KRW",
  korea: "KRW",
  brazil: "BRL",
  mexico: "MXN",
  "saudi arabia": "SAR",
  "united arab emirates": "AED",
  uae: "AED",
  qatar: "QAR",
  kuwait: "KWD",
  turkey: "TRY",
  switzerland: "CHF",
  sweden: "SEK",
  norway: "NOK",
  denmark: "DKK",
  poland: "PLN",
  "south africa": "ZAR",
  nigeria: "NGN",
  egypt: "EGP",
  bangladesh: "BDT",
  "sri lanka": "LKR",
  nepal: "NPR",
  indonesia: "IDR",
  malaysia: "MYR",
  singapore: "SGD",
  thailand: "THB",
  vietnam: "VND",
  philippines: "PHP",
  "new zealand": "NZD",
  russia: "RUB",
  ukraine: "UAH",
};

/** BCP 47 language tags (prefix or full) → currency fallback */
const LANG_REGION_TO_CCY = {
  "en-us": "USD",
  "en-gb": "GBP",
  "en-in": "INR",
  "en-au": "AUD",
  "en-ca": "CAD",
  "en-nz": "NZD",
  "en-sg": "SGD",
  "en-za": "ZAR",
  hi: "INR",
  "hi-in": "INR",
  ur: "PKR",
  "ur-pk": "PKR",
  de: "EUR",
  "de-de": "EUR",
  "de-at": "EUR",
  fr: "EUR",
  "fr-fr": "EUR",
  "fr-ca": "CAD",
  es: "EUR",
  "es-es": "EUR",
  "es-mx": "MXN",
  "es-ar": "ARS",
  it: "EUR",
  pt: "EUR",
  "pt-br": "BRL",
  "pt-pt": "EUR",
  ja: "JPY",
  "ja-jp": "JPY",
  ko: "KRW",
  "ko-kr": "KRW",
  zh: "CNY",
  "zh-cn": "CNY",
  "zh-tw": "TWD",
  ar: "SAR",
  "ar-sa": "SAR",
  "ar-ae": "AED",
  tr: "TRY",
  "tr-tr": "TRY",
  ru: "RUB",
  "ru-ru": "RUB",
  nl: "EUR",
  "nl-nl": "EUR",
  sv: "SEK",
  "sv-se": "SEK",
  no: "NOK",
  nb: "NOK",
  da: "DKK",
  pl: "PLN",
  "pl-pl": "PLN",
  th: "THB",
  "th-th": "THB",
  vi: "VND",
  id: "IDR",
  ms: "MYR",
};

const DEFAULT_CCY = "USD";

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string | null | undefined} country - free-text country from profile
 * @returns {string | null} ISO 4217 or null if unknown
 */
export function currencyFromCountry(country) {
  const n = norm(country);
  if (!n) return null;
  if (COUNTRY_HINT_TO_CCY[n]) return COUNTRY_HINT_TO_CCY[n];
  for (const [hint, ccy] of Object.entries(COUNTRY_HINT_TO_CCY)) {
    if (n.includes(hint) || hint.includes(n)) return ccy;
  }
  return null;
}

/**
 * @param {string | undefined} acceptLanguage - raw Accept-Language header
 */
export function currencyFromAcceptLanguage(acceptLanguage) {
  if (!acceptLanguage || typeof acceptLanguage !== "string") return DEFAULT_CCY;
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase();
  if (!first) return DEFAULT_CCY;
  const tag = first.split(";")[0]?.trim();
  if (!tag) return DEFAULT_CCY;
  if (LANG_REGION_TO_CCY[tag]) return LANG_REGION_TO_CCY[tag];
  const short = tag.split("-")[0];
  if (short && LANG_REGION_TO_CCY[short]) return LANG_REGION_TO_CCY[short];
  return DEFAULT_CCY;
}

/**
 * Locality default: country wins when set and mapped; else browser languages.
 */
export function resolveLocalityCurrency(country, acceptLanguage) {
  const fromCountry = currencyFromCountry(country);
  if (fromCountry) return fromCountry;
  return currencyFromAcceptLanguage(acceptLanguage);
}
