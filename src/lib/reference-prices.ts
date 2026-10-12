import { normalizeStateName } from "@/lib/market-prices";

// Approximate mandi prices gathered from public price-listing websites
// (Acrop, Commodity Online, Farmer.in, KisanDeals, Napanta) in October 2026.
// They are NOT live Agmarknet market reports. The Market page shows them,
// clearly labelled, only while the live data.gov.in feed is unavailable.
// Only recent, consistent figures are included; where sources disagreed or
// were months old the crop is left out rather than guessed.
export type ReferencePrice = {
  commodity: string;
  modalPrice: number; // ₹ per quintal
  asOf: string; // YYYY-MM-DD
  // "state_average": average across reporting mandis in the state.
  // "mandi": a single named mandi.
  basis: "state_average" | "mandi";
  market?: string;
};

export const FALLBACK_STATE = "Andhra Pradesh";

const REFERENCE_PRICES: Record<string, ReferencePrice[]> = {
  "Andhra Pradesh": [
    { commodity: "Paddy", modalPrice: 2523, asOf: "2026-10-09", basis: "state_average" },
    { commodity: "Tomato", modalPrice: 1797, asOf: "2026-10-09", basis: "state_average" },
    { commodity: "Onion", modalPrice: 3065, asOf: "2026-10-09", basis: "state_average" },
    { commodity: "Maize", modalPrice: 2586, asOf: "2026-10-09", basis: "state_average" },
    { commodity: "Groundnut", modalPrice: 7050, asOf: "2026-10-09", basis: "state_average" },
    { commodity: "Cotton", modalPrice: 8250, asOf: "2026-10-09", basis: "state_average" },
    { commodity: "Dry Chilli", modalPrice: 20859, asOf: "2026-10-09", basis: "state_average" },
    { commodity: "Turmeric", modalPrice: 14662, asOf: "2026-10-06", basis: "mandi", market: "Duggirala" },
  ],
  Telangana: [
    { commodity: "Cotton", modalPrice: 8054, asOf: "2026-10-08", basis: "state_average" },
    { commodity: "Onion", modalPrice: 4050, asOf: "2026-10-07", basis: "mandi", market: "Devarakadra" },
    { commodity: "Tomato", modalPrice: 3000, asOf: "2026-10-06", basis: "state_average" },
    { commodity: "Paddy", modalPrice: 2689, asOf: "2026-10-01", basis: "state_average" },
  ],
  Karnataka: [
    { commodity: "Paddy", modalPrice: 2200, asOf: "2026-10-09", basis: "mandi", market: "Mandya" },
    { commodity: "Onion", modalPrice: 1450, asOf: "2026-10-07", basis: "mandi", market: "Tumkur" },
    { commodity: "Maize", modalPrice: 2515, asOf: "2026-10-12", basis: "mandi", market: "Challakere" },
  ],
  "Tamil Nadu": [
    { commodity: "Paddy", modalPrice: 2107, asOf: "2026-10-11", basis: "mandi", market: "Cheyyar" },
    { commodity: "Tomato", modalPrice: 2590, asOf: "2026-09-13", basis: "state_average" },
  ],
  Maharashtra: [
    { commodity: "Paddy", modalPrice: 3075, asOf: "2026-10-06", basis: "state_average" },
    { commodity: "Onion", modalPrice: 4000, asOf: "2026-10-01", basis: "mandi", market: "Manmad" },
  ],
};

// "Paddy(Dhan)(Common)" -> "paddy", "dry chilli" -> "dry chilli"
function simplify(name: string): string {
  return name.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function matchesCommodity(price: ReferencePrice, query: string): boolean {
  const q = simplify(query);
  if (!q) return true;
  const name = simplify(price.commodity);
  return name.includes(q) || q.includes(name);
}

export type ReferenceLookup = {
  prices: ReferencePrice[];
  // The state the prices are actually for.
  sourceState: string;
  // "exact" when we have figures for the requested state; "fallback" when
  // we don't and are showing Andhra Pradesh's instead.
  match: "exact" | "fallback";
};

export function getReferencePrices(state: string, commodity = ""): ReferenceLookup {
  const requested = normalizeStateName(state);
  const exact = REFERENCE_PRICES[requested];
  const sourceState = exact ? requested : FALLBACK_STATE;
  const all = REFERENCE_PRICES[sourceState];

  return {
    prices: all.filter((price) => matchesCommodity(price, commodity)),
    sourceState,
    match: exact ? "exact" : "fallback",
  };
}

export const REFERENCE_PRICE_STATES = Object.keys(REFERENCE_PRICES);
