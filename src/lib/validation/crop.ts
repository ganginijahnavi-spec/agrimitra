import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

// Error messages are keys under the "Crops.form.validation" messages
// namespace, translated by the form, so they show in the farmer's language.
export const cropFormSchema = z
  .object({
    cropName: z.string().trim().min(1, "cropNameRequired"),
    variety: optionalText,
    areaAcres: z.coerce.number().positive("areaPositive"),
    soilType: optionalText,
    sowingDate: optionalDate,
    expectedHarvestDate: optionalDate,
    irrigationType: optionalText,
    notes: optionalText,
  })
  .refine(
    (data) =>
      !data.sowingDate || !data.expectedHarvestDate
        ? true
        : new Date(data.expectedHarvestDate) > new Date(data.sowingDate),
    {
      message: "harvestAfterSowing",
      path: ["expectedHarvestDate"],
    },
  );

export type CropFormValues = z.infer<typeof cropFormSchema>;
// react-hook-form drives the pre-parse shape (areaAcres starts as unknown
// input for z.coerce.number()); the resolver's output is CropFormValues.
export type CropFormInput = z.input<typeof cropFormSchema>;

export const cropFormDefaults: CropFormValues = {
  cropName: "",
  variety: undefined,
  areaAcres: 0,
  soilType: undefined,
  sowingDate: undefined,
  expectedHarvestDate: undefined,
  irrigationType: undefined,
  notes: undefined,
};
