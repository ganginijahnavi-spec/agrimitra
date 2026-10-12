import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/functions", () => ({ callEdgeFunction: vi.fn() }));

const { FALLBACK_STATE, REFERENCE_PRICE_STATES, getReferencePrices } = await import("./reference-prices");

describe("getReferencePrices", () => {
  it("returns that state's own figures when we have them", () => {
    const lookup = getReferencePrices("Karnataka");
    expect(lookup.match).toBe("exact");
    expect(lookup.sourceState).toBe("Karnataka");
    expect(lookup.prices.map((p) => p.commodity)).toEqual(["Paddy", "Onion", "Maize"]);
  });

  it("normalizes how the state is typed", () => {
    expect(getReferencePrices("andhra pradesh").sourceState).toBe("Andhra Pradesh");
    expect(getReferencePrices("  TAMIL   nadu ").sourceState).toBe("Tamil Nadu");
  });

  it("falls back to Andhra Pradesh, flagged as a fallback, for other states", () => {
    const lookup = getReferencePrices("Gujarat");
    expect(lookup.match).toBe("fallback");
    expect(lookup.sourceState).toBe(FALLBACK_STATE);
    expect(lookup.prices.length).toBeGreaterThan(0);
  });

  it("matches Agmarknet-style commodity names", () => {
    expect(getReferencePrices("Andhra Pradesh", "Paddy(Dhan)(Common)").prices[0].commodity).toBe("Paddy");
    expect(getReferencePrices("Andhra Pradesh", "tomato").prices).toHaveLength(1);
    expect(getReferencePrices("Andhra Pradesh", "chilli").prices[0].commodity).toBe("Dry Chilli");
  });

  it("returns nothing for a crop we have no figure for, instead of guessing", () => {
    expect(getReferencePrices("Karnataka", "tomato").prices).toEqual([]);
    expect(getReferencePrices("Andhra Pradesh", "dragon fruit").prices).toEqual([]);
  });

  it("returns every crop when no commodity is given", () => {
    expect(getReferencePrices("Andhra Pradesh").prices).toHaveLength(8);
  });
});

describe("reference data", () => {
  it("is well-formed and dated", () => {
    for (const state of REFERENCE_PRICE_STATES) {
      for (const price of getReferencePrices(state).prices) {
        expect(price.modalPrice).toBeGreaterThan(0);
        expect(price.asOf).toMatch(/^2026-\d{2}-\d{2}$/);
        if (price.basis === "mandi") expect(price.market).toBeTruthy();
      }
    }
  });

  it("covers Andhra Pradesh, the fallback state", () => {
    expect(REFERENCE_PRICE_STATES).toContain(FALLBACK_STATE);
  });
});
