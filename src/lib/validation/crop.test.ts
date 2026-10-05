import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import te from "@/messages/te.json";
import { cropFormSchema } from "./crop";

const validInput = {
  cropName: "Paddy",
  variety: "IR64",
  areaAcres: "2.5",
  soilType: "Clay loam",
  sowingDate: "2026-06-01",
  expectedHarvestDate: "2026-10-01",
  irrigationType: "Canal",
  notes: "First season",
};

describe("cropFormSchema", () => {
  it("accepts a fully filled valid form", () => {
    const result = cropFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.areaAcres).toBe(2.5);
    }
  });

  it("accepts the minimal required fields, with optional fields undefined", () => {
    const result = cropFormSchema.safeParse({ cropName: "Paddy", areaAcres: "1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variety).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("rejects a blank crop name", () => {
    const result = cropFormSchema.safeParse({ ...validInput, cropName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive area", () => {
    const result = cropFormSchema.safeParse({ ...validInput, areaAcres: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative area", () => {
    const result = cropFormSchema.safeParse({ ...validInput, areaAcres: "-5" });
    expect(result.success).toBe(false);
  });

  it("rejects a harvest date on or before the sowing date", () => {
    const result = cropFormSchema.safeParse({
      ...validInput,
      sowingDate: "2026-10-01",
      expectedHarvestDate: "2026-06-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("expectedHarvestDate");
    }
  });

  it("allows a harvest date when no sowing date is set", () => {
    const result = cropFormSchema.safeParse({
      ...validInput,
      sowingDate: undefined,
      expectedHarvestDate: "2026-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("uses error messages that are translated in both languages", () => {
    const result = cropFormSchema.safeParse({
      cropName: "",
      areaAcres: "0",
      sowingDate: "2026-10-01",
      expectedHarvestDate: "2026-06-01",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const keys = result.error.issues.map((issue) => issue.message);
    expect(keys).toEqual(
      expect.arrayContaining(["cropNameRequired", "areaPositive"]),
    );
    for (const key of [...keys, "harvestAfterSowing"]) {
      expect(en.Crops.form.validation).toHaveProperty(key);
      expect(te.Crops.form.validation).toHaveProperty(key);
    }
  });

  it("trims whitespace-only optional text fields to undefined", () => {
    const result = cropFormSchema.safeParse({ ...validInput, variety: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variety).toBeUndefined();
    }
  });
});
