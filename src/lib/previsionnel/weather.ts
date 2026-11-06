import "server-only";
import type { WeatherDay } from "./types";
import { cacheGet, cacheSet } from "./db";

// Open-Meteo : gratuit, sans clé. Marseille centre.
const LAT = 43.2965;
const LON = 5.3698;
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

type OpenMeteoDaily = {
  daily?: { time?: string[]; precipitation_sum?: (number | null)[]; temperature_2m_max?: (number | null)[] };
};

function toDays(json: OpenMeteoDaily, source: WeatherDay["source"]): WeatherDay[] {
  const t = json.daily?.time ?? [];
  const p = json.daily?.precipitation_sum ?? [];
  const tm = json.daily?.temperature_2m_max ?? [];
  return t.map((date, i) => ({ date, precip: p[i] ?? null, tmax: tm[i] ?? null, source }));
}

async function getJson(url: string): Promise<OpenMeteoDaily> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return (await res.json()) as OpenMeteoDaily;
}

/** Prévision 16 jours + 92 jours passés. */
async function fetchForecast(): Promise<WeatherDay[]> {
  const url = `${FORECAST_URL}?latitude=${LAT}&longitude=${LON}&daily=precipitation_sum,temperature_2m_max&timezone=Europe%2FParis&forecast_days=16&past_days=92`;
  return toDays(await getJson(url), "forecast");
}

/** Archive quotidienne entre deux dates (dispo jusqu'à J-5 environ). */
async function fetchArchive(start: string, end: string): Promise<WeatherDay[]> {
  const url = `${ARCHIVE_URL}?latitude=${LAT}&longitude=${LON}&start_date=${start}&end_date=${end}&daily=precipitation_sum,temperature_2m_max&timezone=Europe%2FParis`;
  return toDays(await getJson(url), "archive");
}

/**
 * Météo complète : archive sur ~400 jours (cache 24 h) + prévision (cache 3 h).
 * Les jours passés viennent de l'archive quand elle les couvre, sinon de la fenêtre past_days de la prévision.
 */
export async function getWeather(today: string): Promise<{ days: WeatherDay[]; error: string | null }> {
  const errors: string[] = [];
  let archive: WeatherDay[] = [];
  let forecast: WeatherDay[] = [];

  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 400);
  const archStart = start.toISOString().slice(0, 10);
  const archEnd = new Date(`${today}T00:00:00Z`);
  archEnd.setUTCDate(archEnd.getUTCDate() - 6);
  const archEndISO = archEnd.toISOString().slice(0, 10);

  try {
    const cached = await cacheGet<WeatherDay[]>(`weather:archive:${archStart}:${archEndISO}`, 24 * 3600);
    archive = cached ?? (await fetchArchive(archStart, archEndISO));
    if (!cached) await cacheSet(`weather:archive:${archStart}:${archEndISO}`, archive);
  } catch (err) {
    errors.push(`archive: ${(err as Error).message}`);
  }
  try {
    const cached = await cacheGet<WeatherDay[]>("weather:forecast", 3 * 3600);
    forecast = cached ?? (await fetchForecast());
    if (!cached) await cacheSet("weather:forecast", forecast);
  } catch (err) {
    errors.push(`prévision: ${(err as Error).message}`);
  }

  const map = new Map<string, WeatherDay>();
  for (const d of forecast) map.set(d.date, d);
  for (const d of archive) map.set(d.date, d); // l'archive prime sur les jours passés
  // Les jours ≥ aujourd'hui restent "forecast".
  const days = [...map.values()]
    .map((d) => (d.date >= today ? { ...d, source: "forecast" as const } : { ...d, source: "archive" as const }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { days, error: errors.length ? errors.join(" ; ") : null };
}
