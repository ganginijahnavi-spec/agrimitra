"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import {
  cropFormSchema,
  cropFormDefaults,
  type CropFormValues,
  type CropFormInput,
} from "@/lib/validation/crop";
import { initialCropActionState, type CropActionState } from "@/lib/actions/crops-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

type CropFormAction = (
  state: CropActionState,
  formData: FormData,
) => Promise<CropActionState>;

export function CropForm({
  action,
  defaultValues,
  submitLabel,
  pendingLabel,
}: {
  action: CropFormAction;
  defaultValues?: Partial<CropFormValues>;
  submitLabel: string;
  pendingLabel: string;
}) {
  const t = useTranslations("Crops.form");
  const [state, dispatch, isDispatching] = useActionState(action, initialCropActionState);
  const [isTransitioning, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CropFormInput, unknown, CropFormValues>({
    resolver: zodResolver(cropFormSchema),
    defaultValues: { ...cropFormDefaults, ...defaultValues },
  });

  function onSubmit(values: CropFormValues) {
    const formData = new FormData();
    formData.set("cropName", values.cropName);
    formData.set("variety", values.variety ?? "");
    formData.set("areaAcres", String(values.areaAcres));
    formData.set("soilType", values.soilType ?? "");
    formData.set("sowingDate", values.sowingDate ?? "");
    formData.set("expectedHarvestDate", values.expectedHarvestDate ?? "");
    formData.set("irrigationType", values.irrigationType ?? "");
    formData.set("notes", values.notes ?? "");

    startTransition(() => {
      dispatch(formData);
    });
  }

  const pending = isDispatching || isTransitioning;
  const errorText = (message?: string) =>
    message && t.has(`validation.${message}`) ? t(`validation.${message}`) : message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {state.status === "error" && state.errorMessage && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{t(`errors.${state.errorMessage}`)}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="cropName">{t("cropName")}</Label>
        <Input id="cropName" aria-invalid={!!errors.cropName} {...register("cropName")} />
        {errors.cropName && <p className="text-sm text-destructive">{errorText(errors.cropName.message)}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="variety">
          {t("variety")} <span className="text-muted-foreground">({t("optional")})</span>
        </Label>
        <Input id="variety" {...register("variety")} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="areaAcres">{t("areaAcres")}</Label>
        <Input
          id="areaAcres"
          type="number"
          min="0"
          step="0.1"
          aria-invalid={!!errors.areaAcres}
          {...register("areaAcres")}
        />
        {errors.areaAcres && <p className="text-sm text-destructive">{errorText(errors.areaAcres.message)}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="soilType">
          {t("soilType")} <span className="text-muted-foreground">({t("optional")})</span>
        </Label>
        <Input id="soilType" {...register("soilType")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sowingDate">
            {t("sowingDate")} <span className="text-muted-foreground">({t("optional")})</span>
          </Label>
          <Input id="sowingDate" type="date" {...register("sowingDate")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expectedHarvestDate">
            {t("expectedHarvestDate")} <span className="text-muted-foreground">({t("optional")})</span>
          </Label>
          <Input
            id="expectedHarvestDate"
            type="date"
            aria-invalid={!!errors.expectedHarvestDate}
            {...register("expectedHarvestDate")}
          />
          {errors.expectedHarvestDate && (
            <p className="text-sm text-destructive">{errorText(errors.expectedHarvestDate.message)}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="irrigationType">
          {t("irrigationType")} <span className="text-muted-foreground">({t("optional")})</span>
        </Label>
        <Input id="irrigationType" {...register("irrigationType")} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">
          {t("notes")} <span className="text-muted-foreground">({t("optional")})</span>
        </Label>
        <Textarea id="notes" rows={3} {...register("notes")} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
