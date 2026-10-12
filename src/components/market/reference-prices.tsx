import { Info } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ReferenceLookup } from "@/lib/reference-prices";

// Approximate, clearly-labelled prices shown while live data is unavailable.
export async function ReferencePrices({
  lookup,
  requestedState,
}: {
  lookup: ReferenceLookup;
  requestedState: string;
}) {
  const t = await getTranslations("Market.reference");
  const tMarket = await getTranslations("Market");
  const format = await getFormatter();

  return (
    <section className="space-y-4" aria-labelledby="reference-prices-title">
      <div className="flex items-start gap-2 rounded-md bg-secondary/60 px-3 py-2 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p id="reference-prices-title" className="font-medium">
            {t("title")}
          </p>
          <p>{t("explanation")}</p>
          {lookup.match === "fallback" && (
            <p>{t("fallback", { state: requestedState, sourceState: lookup.sourceState })}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lookup.prices.map((price) => (
          <Card key={price.commodity} className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{price.commodity}</CardTitle>
              <CardDescription>
                {price.basis === "mandi" && price.market
                  ? t("atMarket", { market: price.market })
                  : t("stateAverage", { state: lookup.sourceState })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{t("approxPrice")}</span>
                <span className="text-xl font-bold text-foreground">
                  ₹{format.number(price.modalPrice)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("asOf", {
                  date: format.dateTime(new Date(price.asOf), { dateStyle: "medium" }),
                })}{" "}
                &middot; {tMarket("unit")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">{t("sources")}</p>
    </section>
  );
}
