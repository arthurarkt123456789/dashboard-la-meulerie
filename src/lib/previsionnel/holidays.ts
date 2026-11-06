// Jours fériés français (métropole). Pur, sans dépendance.

function easterSunday(year: number): Date {
  // Algorithme de Meeus/Jones/Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

const cache = new Map<number, Map<string, string>>();

export function frenchHolidays(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const easter = easterSunday(year);
  const map = new Map<string, string>([
    [`${year}-01-01`, "Jour de l'an"],
    [iso(addDays(easter, 1)), "Lundi de Pâques"],
    [`${year}-05-01`, "Fête du Travail"],
    [`${year}-05-08`, "Victoire 1945"],
    [iso(addDays(easter, 39)), "Ascension"],
    [iso(addDays(easter, 50)), "Lundi de Pentecôte"],
    [`${year}-07-14`, "Fête nationale"],
    [`${year}-08-15`, "Assomption"],
    [`${year}-11-01`, "Toussaint"],
    [`${year}-11-11`, "Armistice"],
    [`${year}-12-25`, "Noël"],
  ]);
  cache.set(year, map);
  return map;
}

/** Nom du férié pour une date ISO, ou null. */
export function holidayName(dateISO: string): string | null {
  const year = Number(dateISO.slice(0, 4));
  return frenchHolidays(year).get(dateISO) ?? null;
}
