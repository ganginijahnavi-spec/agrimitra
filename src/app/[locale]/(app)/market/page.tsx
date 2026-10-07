import { MapPin, Search, TrendingUp } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { lookupMarketPrices } from "@/lib/market-prices";
import type { MarketPricesResponse, MarketSort } from "@/lib/market";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { MarketTrendChart } from "@/components/market/market-trend-chart";

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Market");
  const format = await getFormatter();
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect({ href: "/login", locale });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("state, district")
    .eq("id", user.id)
    .single();

  const asString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  // Once the form has been submitted (any query params present), respect
  // exactly what's there — including an intentionally cleared field —
  // rather than silently reapplying the profile defaults.
  const hasSubmittedFilters = Object.keys(sp).length > 0;
  const state = hasSubmittedFilters ? asString(sp.state) : (profile?.state ?? "");
  const district = hasSubmittedFilters ? asString(sp.district) : (profile?.district ?? "");
  const market = asString(sp.market);
  const commodity = asString(sp.commodity);
  const sort = (asString(sp.sort) || "date_desc") as MarketSort;

  let result: MarketPricesResponse | null = null;
  let fetchError = false;
  let widenedToState = false;

  if (state) {
    const lookup = await lookupMarketPrices({ state, district, market, commodity, sort });
    result = lookup.result;
    fetchError = lookup.error;
    widenedToState = lookup.scope === "state";
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card className="mb-6 border-none shadow-sm">
        <CardContent>
          <form method="GET" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="commodity">{t("commodityLabel")}</Label>
              <Input
                id="commodity"
                name="commodity"
                defaultValue={commodity}
                placeholder={t("commodityPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">{t("stateLabel")}</Label>
              <Input id="state" name="state" defaultValue={state} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="district">
                {t("districtLabel")} <span className="text-muted-foreground">({t("optional")})</span>
              </Label>
              <Input id="district" name="district" defaultValue={district} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="market">
                {t("marketLabel")} <span className="text-muted-foreground">({t("optional")})</span>
              </Label>
              <Input id="market" name="market" defaultValue={market} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort">{t("sortLabel")}</Label>
              <select id="sort" name="sort" defaultValue={sort} className={selectClassName}>
                <option value="date_desc">{t("sortDateDesc")}</option>
                <option value="price_asc">{t("sortPriceAsc")}</option>
                <option value="price_desc">{t("sortPriceDesc")}</option>
              </select>
            </div>
            <div className="flex items-end lg:col-span-4">
              <Button type="submit">
                <Search className="size-4" aria-hidden="true" />
                {t("search")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!state ? (
        <EmptyState
          icon={MapPin}
          title={t("noStateTitle")}
          description={t("noStateDescription")}
          action={
            <Button render={<Link href="/profile" />} className="mt-2">
              {t("setLocation")}
            </Button>
          }
        />
      ) : fetchError ? (
        <ErrorState title={t("errorTitle")} />
      ) : !result || result.prices.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="space-y-6">
          {result.trend.length >= 2 && (
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-primary" aria-hidden="true" />
                  {t("trendTitle")}
                </CardTitle>
                <CardDescription>
                  {t("trendSubtitle", {
                    commodity: result.prices[0].commodity,
                    market: result.prices[0].market,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MarketTrendChart trend={result.trend} />
              </CardContent>
            </Card>
          )}

          {widenedToState && (
            <p className="flex items-start gap-1.5 rounded-md bg-secondary/60 px-3 py-2 text-sm text-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("districtFallback", { district, state: result.prices[0].state })}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            {t("resultsCount", { count: result.prices.length })}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.prices.map((price) => (
              <Card key={price.id} className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    {price.commodity}
                    {price.variety && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({price.variety})
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {[price.market, price.district].filter(Boolean).join(", ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">{t("modalPrice")}</span>
                    <span className="text-xl font-bold text-foreground">
                      ₹{price.modal_price != null ? format.number(price.modal_price) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {t("minPrice")}: ₹
                      {price.min_price != null ? format.number(price.min_price) : "—"}
                    </span>
                    <span>
                      {t("maxPrice")}: ₹
                      {price.max_price != null ? format.number(price.max_price) : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(price.arrival_date), { dateStyle: "medium" })} &middot;{" "}
                    {t("unit")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground">{t("source")}</p>
        </div>
      )}
    </div>
  );
}
