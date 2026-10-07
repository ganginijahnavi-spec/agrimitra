import { beforeEach, describe, expect, it, vi } from "vitest";

const callEdgeFunction = vi.fn();
vi.mock("@/lib/functions", () => ({ callEdgeFunction: (...args: unknown[]) => callEdgeFunction(...args) }));

const { agmarknetStateAlias, describeUpstream, lookupMarketPrices, normalizeStateName } =
  await import("./market-prices");

const price = (market: string) => ({
  id: market,
  state: "Andhra Pradesh",
  district: "Krishna",
  market,
  commodity: "Paddy(Dhan)(Common)",
  variety: "Common",
  grade: null,
  arrival_date: "2026-10-06",
  min_price: 2100,
  max_price: 2300,
  modal_price: 2200,
});

const ok = (markets: string[]) => ({ data: { prices: markets.map(price), trend: [] }, error: null, status: 200 });

describe("normalizeStateName", () => {
  it.each([
    ["andhra pradesh", "Andhra Pradesh"],
    ["  TAMIL   nadu ", "Tamil Nadu"],
    ["jammu and kashmir", "Jammu and Kashmir"],
    ["Andhra Pradesh", "Andhra Pradesh"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeStateName(input)).toBe(expected);
  });
});

describe("agmarknetStateAlias", () => {
  it("maps Open-Meteo spellings to Agmarknet ones", () => {
    expect(agmarknetStateAlias("Delhi")).toBe("NCT of Delhi");
    expect(agmarknetStateAlias("Puducherry")).toBe("Pondicherry");
  });
  it("returns null when there's nothing to translate", () => {
    expect(agmarknetStateAlias("Andhra Pradesh")).toBeNull();
    expect(agmarknetStateAlias("NCT of Delhi")).toBeNull();
  });
});

describe("lookupMarketPrices", () => {
  beforeEach(() => callEdgeFunction.mockReset());

  it("uses district prices when the district has any", async () => {
    callEdgeFunction.mockResolvedValueOnce(ok(["Vijayawada"]));
    const lookup = await lookupMarketPrices({ state: "andhra pradesh", district: "Krishna" });

    expect(lookup.scope).toBe("district");
    expect(lookup.result?.prices[0].market).toBe("Vijayawada");
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
    expect(callEdgeFunction.mock.calls[0][1].searchParams).toMatchObject({
      state: "Andhra Pradesh",
      district: "Krishna",
    });
  });

  it("runs the function in the Mumbai region, since data.gov.in refuses foreign connections", async () => {
    callEdgeFunction.mockResolvedValueOnce(ok(["Vijayawada"]));
    await lookupMarketPrices({ state: "Andhra Pradesh" });
    expect(callEdgeFunction.mock.calls[0][1].region).toBe("ap-south-1");
  });

  it("passes on the latest data.gov.in refresh report", async () => {
    const upstream = { ok: false, records: 0, error: "upstream_failed" as const };
    callEdgeFunction.mockResolvedValue({ data: { prices: [], trend: [], upstream }, error: null, status: 200 });
    const lookup = await lookupMarketPrices({ state: "Andhra Pradesh", district: "NTR" });
    expect(lookup.upstream).toEqual(upstream);
  });

  it("widens to the whole state when the district has no prices", async () => {
    callEdgeFunction.mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok(["Guntur"]));
    const lookup = await lookupMarketPrices({ state: "Andhra Pradesh", district: "NTR" });

    expect(lookup.scope).toBe("state");
    expect(lookup.result?.prices[0].market).toBe("Guntur");
    expect(callEdgeFunction.mock.calls[1][1].searchParams.district).toBeUndefined();
  });

  it("retries with the Agmarknet state spelling", async () => {
    callEdgeFunction.mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok(["Azadpur"]));
    const lookup = await lookupMarketPrices({ state: "Delhi" });

    expect(lookup.result?.prices[0].market).toBe("Azadpur");
    expect(callEdgeFunction.mock.calls[1][1].searchParams.state).toBe("NCT of Delhi");
  });

  it("reports an error only when no attempt succeeded", async () => {
    callEdgeFunction.mockResolvedValue({ data: null, error: "network_error", status: 0 });
    const lookup = await lookupMarketPrices({ state: "Andhra Pradesh", district: "NTR" });
    expect(lookup.error).toBe(true);
    expect(lookup.result).toBeNull();
  });

  it("returns an empty result (not an error) when nothing matches anywhere", async () => {
    callEdgeFunction.mockResolvedValue(ok([]));
    const lookup = await lookupMarketPrices({ state: "Andhra Pradesh", district: "NTR" });
    expect(lookup.error).toBe(false);
    expect(lookup.result?.prices).toEqual([]);
  });
});

describe("describeUpstream", () => {
  it("says nothing when no refresh happened", () => {
    expect(describeUpstream(null, "Andhra Pradesh")).toBeNull();
  });

  it.each([
    [{ ok: false, records: 0, error: "missing_api_key" as const }, "missingKey", true],
    [{ ok: false, status: 403, records: 0, error: "upstream_failed" as const }, "keyRejected", true],
    [{ ok: false, status: 429, records: 0, error: "upstream_failed" as const }, "rateLimited", true],
    [{ ok: false, records: 0, error: "upstream_failed" as const }, "unreachable", true],
    [{ ok: false, records: 500, error: "cache_write_failed" as const }, "saveFailed", true],
    [{ ok: true, records: 0 }, "noReportsToday", false],
    [{ ok: true, records: 10 }, "demoKeyCap", false],
  ])("%o -> %s", (upstream, key, isFailure) => {
    expect(describeUpstream(upstream, "andhra pradesh")).toMatchObject({ key, isFailure });
  });

  it("stays quiet for a healthy full refresh", () => {
    expect(describeUpstream({ ok: true, records: 742 }, "Andhra Pradesh")).toBeNull();
  });

  it("uses the canonical state name in the no-reports message", () => {
    expect(describeUpstream({ ok: true, records: 0 }, "andhra pradesh")?.values).toEqual({
      state: "Andhra Pradesh",
    });
  });
});
