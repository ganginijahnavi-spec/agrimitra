import { callEdgeFunction } from "@/lib/functions";
import type { MarketPricesResponse, MarketSort, MarketUpstreamStatus } from "@/lib/market";

// Agmarknet (data.gov.in) spells some states differently from Open-Meteo,
// which is where profile locations come from. Keys are lowercase.
const AGMARKNET_STATE_NAMES: Record<string, string> = {
  delhi: "NCT of Delhi",
  "nct of delhi": "NCT of Delhi",
  "national capital territory of delhi": "NCT of Delhi",
  puducherry: "Pondicherry",
  chhattisgarh: "Chattisgarh",
  uttarakhand: "Uttrakhand",
  orissa: "Odisha",
  "jammu & kashmir": "Jammu and Kashmir",
};

// data.gov.in refuses connections from outside India, so the market-prices
// function must run in Supabase's Mumbai region.
const MARKET_FUNCTION_REGION = "ap-south-1";

// "andhra pradesh" -> "Andhra Pradesh", "jammu and kashmir" -> "Jammu and Kashmir"
export function normalizeStateName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word, i) => (i > 0 && (word === "and" || word === "of") ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function agmarknetStateAlias(state: string): string | null {
  const alias = AGMARKNET_STATE_NAMES[state.trim().toLowerCase()];
  return alias && alias !== state ? alias : null;
}

export type MarketLookup = {
  result: MarketPricesResponse | null;
  error: boolean;
  // "district" when the prices are from the requested district; "state"
  // when the district had none and we widened to the whole state.
  scope: "district" | "state";
  // The latest data.gov.in refresh report seen while looking, if any.
  upstream: MarketUpstreamStatus | null;
};

// Finds prices as close to the farmer as the data allows: their district
// first, then the whole state. Profile districts come from Open-Meteo and
// often don't match Agmarknet's (older) district names, so the state-wide
// fallback is what keeps prices "based on place" instead of empty.
export async function lookupMarketPrices(params: {
  state: string;
  district?: string;
  market?: string;
  commodity?: string;
  sort?: MarketSort;
  timeoutMs?: number;
}): Promise<MarketLookup> {
  const deadline = Date.now() + (params.timeoutMs ?? 30_000);
  const state = normalizeStateName(params.state);
  const district = params.district?.trim() || undefined;
  const states = [state, agmarknetStateAlias(state)].filter((s): s is string => !!s);

  let anySucceeded = false;
  let upstream: MarketUpstreamStatus | null = null;
  attempts: for (const candidateState of states) {
    for (const candidateDistrict of district ? [district, undefined] : [undefined]) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break attempts;

      const { data, error } = await callEdgeFunction<MarketPricesResponse>("market-prices", {
        searchParams: {
          state: candidateState,
          district: candidateDistrict,
          market: params.market,
          commodity: params.commodity,
          sort: params.sort,
        },
        timeoutMs: remaining,
        region: MARKET_FUNCTION_REGION,
      });

      if (error || !data) continue;
      anySucceeded = true;
      upstream = data.upstream ?? upstream;
      if (data.prices.length > 0) {
        return {
          result: data,
          error: false,
          scope: district && !candidateDistrict ? "state" : "district",
          upstream,
        };
      }
    }
  }

  return anySucceeded
    ? { result: { prices: [], trend: [] }, error: false, scope: "district", upstream }
    : { result: null, error: true, scope: "district", upstream };
}

// The demo data.gov.in key returns at most 10 records per request.
const DEMO_KEY_RECORD_CAP = 10;

export type UpstreamNotice = {
  key:
    | "missingKey"
    | "keyRejected"
    | "rateLimited"
    | "unreachable"
    | "saveFailed"
    | "demoKeyCap"
    | "noReportsToday";
  // Failures explain an empty result; the rest are informational.
  isFailure: boolean;
  values?: Record<string, string | number>;
};

// Turns the refresh report into a message key under "Market.upstream", or
// null when there's nothing worth telling the farmer.
export function describeUpstream(
  upstream: MarketUpstreamStatus | null,
  state: string,
): UpstreamNotice | null {
  if (!upstream) return null;
  if (upstream.error === "missing_api_key") return { key: "missingKey", isFailure: true };
  if (upstream.error === "cache_write_failed") return { key: "saveFailed", isFailure: true };
  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403) {
      return { key: "keyRejected", isFailure: true, values: { status: upstream.status } };
    }
    if (upstream.status === 429) return { key: "rateLimited", isFailure: true };
    return { key: "unreachable", isFailure: true };
  }
  if (upstream.records === 0) {
    return { key: "noReportsToday", isFailure: false, values: { state: normalizeStateName(state) } };
  }
  if (upstream.records <= DEMO_KEY_RECORD_CAP) {
    return { key: "demoKeyCap", isFailure: false, values: { count: upstream.records } };
  }
  return null;
}
