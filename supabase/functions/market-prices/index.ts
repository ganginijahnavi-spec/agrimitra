import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

// "Current Daily Price of Various Commodities from Various Markets (Mandi)"
// — verified live against api.data.gov.in on 2026-09-22.
const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
// High enough to cover a large state's full daily report in one request;
// 1000 silently cut off markets in states like Uttar Pradesh or Maharashtra.
const UPSTREAM_LIMIT = 5000;
const UPSTREAM_TIMEOUT_MS = 20_000;
const RESULT_LIMIT = 200;

type MarketCacheRow = {
  state: string;
  district: string | null;
  market: string;
  commodity: string;
  variety: string;
  grade: string | null;
  arrival_date: string;
  min_price: number | null;
  max_price: number | null;
  modal_price: number | null;
  fetched_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const state = url.searchParams.get("state")?.trim();
  const district = url.searchParams.get("district")?.trim();
  const market = url.searchParams.get("market")?.trim();
  const commodity = url.searchParams.get("commodity")?.trim();
  const sort = url.searchParams.get("sort") ?? "date_desc";

  if (!state) {
    return jsonResponse({ error: "missing_state" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    await ensureFreshCache(admin, state);
  } catch (error) {
    // Serve whatever is already cached rather than failing outright when
    // data.gov.in is slow or unavailable.
    console.error("market-prices: upstream fetch failed", error);
  }

  let query = admin.from("market_latest_prices").select("*").eq("state", state);
  if (district) query = query.ilike("district", `%${district}%`);
  if (market) query = query.ilike("market", `%${market}%`);
  if (commodity) query = query.ilike("commodity", `%${commodity}%`);

  if (sort === "price_asc") query = query.order("modal_price", { ascending: true });
  else if (sort === "price_desc") query = query.order("modal_price", { ascending: false });
  else query = query.order("arrival_date", { ascending: false });

  const { data: prices, error } = await query.limit(RESULT_LIMIT);

  if (error) {
    console.error("market-prices: query failed", error);
    return jsonResponse({ error: "query_failed" }, 500);
  }

  // Once filters narrow the result to a single market+commodity+variety,
  // fetch its full cached history for the trend chart (only worth showing
  // once we have at least two distinct dates).
  let trend: { date: string; modalPrice: number }[] = [];
  if (prices && prices.length === 1) {
    const row = prices[0];
    const { data: history } = await admin
      .from("market_cache")
      .select("arrival_date, modal_price")
      .eq("market", row.market)
      .eq("commodity", row.commodity)
      .eq("variety", row.variety)
      .order("arrival_date", { ascending: true });

    if (history && history.length >= 2) {
      trend = history
        .filter((h) => h.modal_price != null)
        .map((h) => ({ date: h.arrival_date as string, modalPrice: h.modal_price as number }));
    }
  }

  return jsonResponse({ prices: prices ?? [], trend }, 200);
});

async function ensureFreshCache(
  admin: SupabaseClient,
  state: string,
): Promise<void> {
  const { data: freshRow } = await admin
    .from("market_cache")
    .select("fetched_at")
    .eq("state", state)
    .gte("fetched_at", new Date(Date.now() - CACHE_TTL_MS).toISOString())
    .limit(1)
    .maybeSingle();

  if (freshRow) return;

  const apiKey = Deno.env.get("DATAGOV_API_KEY");
  if (!apiKey) throw new Error("DATAGOV_API_KEY is not configured");

  const upstreamUrl = new URL(`https://api.data.gov.in/resource/${RESOURCE_ID}`);
  upstreamUrl.searchParams.set("api-key", apiKey);
  upstreamUrl.searchParams.set("format", "json");
  upstreamUrl.searchParams.set("limit", String(UPSTREAM_LIMIT));
  upstreamUrl.searchParams.set("filters[state]", state);

  const response = await fetch(upstreamUrl.toString(), {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`data.gov.in request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const records = (payload.records ?? []) as Record<string, string | number>[];
  if (records.length === 0) return;

  // Stamped explicitly: on upsert conflicts the column default doesn't
  // apply, so re-fetched rows would otherwise keep their old fetched_at and
  // the freshness check above would re-hit data.gov.in on every request.
  const fetchedAt = new Date().toISOString();
  // data.gov.in can report the same market/commodity/variety/day more than
  // once (e.g. different grades), but that's the cache's unique key, and
  // Postgres rejects an upsert batch that touches the same row twice — which
  // would silently leave the whole state uncached. Keep the first of each.
  const rowsByKey = new Map<string, MarketCacheRow>();
  for (const record of records) {
    const row = normalizeRecord(record, fetchedAt);
    if (!row) continue;
    const key = [row.market, row.commodity, row.variety, row.arrival_date].join("|");
    if (!rowsByKey.has(key)) rowsByKey.set(key, row);
  }
  const rows = [...rowsByKey.values()];

  if (rows.length === 0) return;

  const { error } = await admin
    .from("market_cache")
    .upsert(rows, { onConflict: "market,commodity,variety,arrival_date" });

  if (error) {
    console.error("market-prices: cache upsert failed", error);
  }
}

function normalizeRecord(
  record: Record<string, string | number>,
  fetchedAt: string,
): MarketCacheRow | null {
  const state = String(record.state ?? "").trim();
  const market = String(record.market ?? "").trim();
  const commodity = String(record.commodity ?? "").trim();
  const arrivalDate = parseArrivalDate(String(record.arrival_date ?? ""));

  if (!state || !market || !commodity || !arrivalDate) return null;

  return {
    state,
    district: String(record.district ?? "").trim() || null,
    market,
    commodity,
    variety: String(record.variety ?? "").trim(),
    grade: String(record.grade ?? "").trim() || null,
    arrival_date: arrivalDate,
    min_price: toNumberOrNull(record.min_price),
    max_price: toNumberOrNull(record.max_price),
    modal_price: toNumberOrNull(record.modal_price),
    fetched_at: fetchedAt,
  };
}

// data.gov.in returns dates as DD/MM/YYYY.
function parseArrivalDate(raw: string): string | null {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function toNumberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
