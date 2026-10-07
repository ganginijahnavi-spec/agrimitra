import { beforeEach, describe, expect, it, vi } from "vitest";

const callEdgeFunction = vi.fn();
vi.mock("@/lib/functions", () => ({ callEdgeFunction: (...args: unknown[]) => callEdgeFunction(...args) }));

const { agmarknetStateAlias, lookupMarketPrices, normalizeStateName } = await import("./market-prices");

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
