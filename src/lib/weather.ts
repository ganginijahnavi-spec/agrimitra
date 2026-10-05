export type WeatherData = {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperature: number;
    humidity: number;
    windSpeed: number;
    weatherCode: number;
  };
  daily: {
    date: string;
    weatherCode: number;
    tempMax: number;
    tempMin: number;
    precipitationProbability: number;
  }[];
};

// Open-Meteo forecast API — free, no API key required.
export async function getWeather(latitude: number, longitude: number): Promise<WeatherData> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");

  const response = await fetch(url.toString(), {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`);
  }

  const data = await response.json();

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    current: {
      time: data.current.time,
      temperature: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
    },
    daily: (data.daily.time as string[]).map((date, i) => ({
      date,
      weatherCode: data.daily.weather_code[i],
      tempMax: data.daily.temperature_2m_max[i],
      tempMin: data.daily.temperature_2m_min[i],
      precipitationProbability: data.daily.precipitation_probability_max[i],
    })),
  };
}

export type FarmingHint = {
  key: "heavyRainSoon" | "strongWind" | "heatStress";
  values?: Record<string, number>;
};

// Simple rule-based hints — not AI-generated, labelled as general guidance.
export function getFarmingHints(weather: WeatherData): FarmingHint[] {
  const hints: FarmingHint[] = [];

  for (let i = 1; i <= 2 && i < weather.daily.length; i++) {
    if (weather.daily[i].precipitationProbability >= 70) {
      hints.push({ key: "heavyRainSoon", values: { days: i } });
      break;
    }
  }

  if (weather.current.windSpeed >= 25) {
    hints.push({ key: "strongWind" });
  }

  if (weather.daily[0]?.tempMax >= 38) {
    hints.push({ key: "heatStress" });
  }

  return hints;
}
