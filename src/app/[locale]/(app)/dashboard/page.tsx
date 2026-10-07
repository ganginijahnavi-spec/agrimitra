import { Camera, CloudSun, MessageCircle, Plus, Sprout, TrendingUp } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWeather } from "@/lib/weather";
import { lookupMarketPrices } from "@/lib/market-prices";
import { WeatherIcon } from "@/components/weather/weather-icon";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CropCard } from "@/components/crops/crop-card";
import { EmptyState } from "@/components/states/empty-state";

const quickActions = [
  { key: "askAI", href: "/chat", icon: MessageCircle },
  { key: "addCrop", href: "/crops/new", icon: Plus },
  { key: "weather", href: "/weather", icon: CloudSun },
  { key: "market", href: "/market", icon: TrendingUp },
  { key: "analyzeCrop", href: "/analyze", icon: Camera },
] as const;

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");
  const tWeather = await getTranslations("Weather");
  const tMarket = await getTranslations("Market");
  const format = await getFormatter();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect({ href: "/login", locale });
  }

  const [{ data: profile }, { data: crops, count }, { data: chats }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, village, district, state, latitude, longitude")
      .eq("id", user.id)
      .single(),
    supabase
      .from("crops")
      .select("id, crop_name, variety, area_acres, sowing_date", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("chats")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(3),
  ]);

  const totalCrops = count ?? 0;
  const location = [profile?.village, profile?.district, profile?.state].filter(Boolean).join(", ");

  const marketCropName = crops?.[0]?.crop_name;
  // The market card is a nice-to-have summary: a cold data.gov.in cache
  // can be slow, so give up quickly rather than holding the whole
  // dashboard (the first page after login) hostage to it.
  const [weather, marketResult] = await Promise.all([
    profile?.latitude != null && profile?.longitude != null
      ? getWeather(profile.latitude, profile.longitude).catch(() => null)
      : null,
    profile?.state && marketCropName
      ? lookupMarketPrices({
          state: profile.state,
          district: profile.district ?? undefined,
          commodity: marketCropName,
          timeoutMs: 8_000,
        }).then((lookup) => lookup.result)
      : null,
  ]);
  const marketPrice = marketResult?.prices?.[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          {profile?.full_name ? t("welcomeName", { name: profile.full_name }) : t("welcome")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        {location && <p className="mt-1 text-sm text-muted-foreground">{location}</p>}
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {t("quickActions")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {quickActions.map(({ key, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-foreground">{t(key)}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("recentCrops")}</h2>
            <Link href="/crops" className="text-sm text-primary hover:underline">
              {t("viewAllCrops")}
            </Link>
          </div>
          {!crops || crops.length === 0 ? (
            <EmptyState
              icon={Sprout}
              title={t("noCropsYet")}
              action={
                <Button render={<Link href="/crops/new" />} className="mt-2">
                  <Plus className="size-4" aria-hidden="true" />
                  {t("addCrop")}
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {crops.map((crop) => (
                <CropCard
                  key={crop.id}
                  crop={{
                    id: crop.id,
                    cropName: crop.crop_name,
                    variety: crop.variety,
                    areaAcres: crop.area_acres,
                    sowingDate: crop.sowing_date,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{t("totalCrops")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{totalCrops}</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CloudSun className="size-4 text-primary" aria-hidden="true" />
                {t("weather")}
              </CardTitle>
              {weather ? (
                <CardDescription className="flex items-center gap-2 text-foreground">
                  <WeatherIcon code={weather.current.weatherCode} className="size-5 text-primary" />
                  <span className="text-lg font-semibold">
                    {Math.round(weather.current.temperature)}°C
                  </span>
                  <span className="text-muted-foreground">
                    {tWeather(`conditions.${weather.current.weatherCode}`)}
                  </span>
                </CardDescription>
              ) : (
                <CardDescription>
                  {profile?.latitude != null ? t("weatherUnavailable") : t("weatherNoLocation")}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Link href="/weather" className="text-sm text-primary hover:underline">
                {t("viewForecast")}
              </Link>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4 text-primary" aria-hidden="true" />
                {t("market")}
              </CardTitle>
              {marketPrice ? (
                <CardDescription className="text-foreground">
                  <span className="font-semibold">{marketPrice.commodity}</span>:{" "}
                  <span className="font-semibold">
                    ₹{marketPrice.modal_price != null ? format.number(marketPrice.modal_price) : "—"}
                  </span>{" "}
                  <span className="text-muted-foreground">{tMarket("unit")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("marketAt", { market: marketPrice.market })}
                  </span>
                </CardDescription>
              ) : (
                <CardDescription>
                  {!crops || crops.length === 0
                    ? t("marketNoCrops")
                    : !profile?.state
                      ? t("marketNoLocation")
                      : t("marketNoData")}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Link href="/market" className="text-sm text-primary hover:underline">
                {t("viewPrices")}
              </Link>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="size-4 text-primary" aria-hidden="true" />
                {t("recentConversations")}
              </CardTitle>
              {!chats || chats.length === 0 ? (
                <CardDescription>{t("noChatsYet")}</CardDescription>
              ) : (
                <CardDescription>
                  <ul className="space-y-1">
                    {chats.map((chat) => (
                      <li key={chat.id} className="truncate">
                        <Link href={`/chat/${chat.id}`} className="text-foreground hover:text-primary">
                          {chat.title || t("startChat")}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Link href="/chat" className="text-sm text-primary hover:underline">
                {chats && chats.length > 0 ? t("viewAllChats") : t("startChat")}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
