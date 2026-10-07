export type MarketPrice = {
  id: string;
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
};

export type MarketTrendPoint = {
  date: string;
  modalPrice: number;
};

// How the Edge Function's refresh from data.gov.in went; null/absent when
// the cache was fresh and no refresh was attempted.
export type MarketUpstreamStatus = {
  ok: boolean;
  status?: number;
  records: number;
  error?: "missing_api_key" | "upstream_failed" | "cache_write_failed";
};

export type MarketPricesResponse = {
  prices: MarketPrice[];
  trend: MarketTrendPoint[];
  upstream?: MarketUpstreamStatus | null;
};

export type MarketSort = "date_desc" | "price_asc" | "price_desc";
