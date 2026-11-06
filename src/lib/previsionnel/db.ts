import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSql, isConfigured, ready as apiticReady } from "@/lib/apitic/db";
import { DEFAULT_SETTINGS, type EventDay, type Rule, type RuleKind, type Settings } from "./types";

// Persistance du module prévisionnel : règles de classification, événements,
// réglages, cache JSON. Postgres (DATABASE_URL) si dispo, sinon fichiers JSON
// dans APITIC_CACHE_DIR/previsionnel (dev local).

let schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  await apiticReady();
  const s = getSql();
  await s`
    create table if not exists previsionnel_rules (
      store_id text not null,
      key text not null,
      kind text not null,
      label text not null,
      expected_amount numeric,
      expected_day integer,
      updated_at timestamptz not null default now(),
      primary key (store_id, key)
    )
  `;
  await s`
    create table if not exists previsionnel_events (
      id serial primary key,
      store_id text not null,
      date date not null,
      label text not null,
      impact numeric not null default -0.3,
      created_at timestamptz not null default now()
    )
  `;
  await s`
    create table if not exists previsionnel_settings (
      store_id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await s`
    create table if not exists previsionnel_cache (
      key text primary key,
      fetched_at timestamptz not null default now(),
      data jsonb not null
    )
  `;
}

function ready(): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensureSchema().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// ── Fallback fichiers ──────────────────────────────────────────────────────────

function fsDir(): string {
  return path.join(process.env.APITIC_CACHE_DIR ?? path.join(process.cwd(), ".cache", "apitic"), "previsionnel");
}

async function fsRead<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(fsDir(), `${name}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function fsWrite(name: string, data: unknown): Promise<void> {
  await fs.mkdir(fsDir(), { recursive: true });
  await fs.writeFile(path.join(fsDir(), `${name}.json`), JSON.stringify(data, null, 2), "utf8");
}

// ── Règles ─────────────────────────────────────────────────────────────────────

const KINDS: RuleKind[] = ["matiere", "fixe", "hors_exploitation", "variable", "ignorer"];

export function isRuleKind(v: unknown): v is RuleKind {
  return typeof v === "string" && (KINDS as string[]).includes(v);
}

export async function getRules(storeId: string): Promise<Rule[]> {
  if (!isConfigured()) return fsRead<Rule[]>(`rules-${storeId}`, []);
  await ready();
  const rows = await getSql()<{ key: string; kind: string; label: string; expected_amount: string | null; expected_day: number | null }[]>`
    select key, kind, label, expected_amount, expected_day from previsionnel_rules where store_id = ${storeId}
  `;
  return rows
    .filter((r) => isRuleKind(r.kind))
    .map((r) => ({
      key: r.key,
      kind: r.kind as RuleKind,
      label: r.label,
      expectedAmount: r.expected_amount !== null ? Number(r.expected_amount) : null,
      expectedDay: r.expected_day,
    }));
}

export async function upsertRules(storeId: string, rules: Rule[]): Promise<void> {
  if (rules.length === 0) return;
  if (!isConfigured()) {
    const current = await fsRead<Rule[]>(`rules-${storeId}`, []);
    const map = new Map(current.map((r) => [r.key, r]));
    for (const r of rules) map.set(r.key, r);
    await fsWrite(`rules-${storeId}`, [...map.values()]);
    return;
  }
  await ready();
  const sql = getSql();
  for (const r of rules) {
    await sql`
      insert into previsionnel_rules (store_id, key, kind, label, expected_amount, expected_day, updated_at)
      values (${storeId}, ${r.key}, ${r.kind}, ${r.label}, ${r.expectedAmount ?? null}, ${r.expectedDay ?? null}, now())
      on conflict (store_id, key) do update set
        kind = excluded.kind,
        label = excluded.label,
        expected_amount = excluded.expected_amount,
        expected_day = excluded.expected_day,
        updated_at = now()
    `;
  }
}

export async function deleteRule(storeId: string, key: string): Promise<void> {
  if (!isConfigured()) {
    const current = await fsRead<Rule[]>(`rules-${storeId}`, []);
    await fsWrite(`rules-${storeId}`, current.filter((r) => r.key !== key));
    return;
  }
  await ready();
  await getSql()`delete from previsionnel_rules where store_id = ${storeId} and key = ${key}`;
}

// ── Événements (manifs, fermetures…) ───────────────────────────────────────────

export async function getEvents(storeId: string): Promise<EventDay[]> {
  if (!isConfigured()) return fsRead<EventDay[]>(`events-${storeId}`, []);
  await ready();
  const rows = await getSql()<{ id: number; date: string; label: string; impact: string }[]>`
    select id, to_char(date, 'YYYY-MM-DD') as date, label, impact
    from previsionnel_events where store_id in (${storeId}, 'all') order by date
  `;
  return rows.map((r) => ({ id: r.id, date: r.date, label: r.label, impact: Number(r.impact) }));
}

export async function addEvent(storeId: string, ev: Omit<EventDay, "id">): Promise<EventDay> {
  if (!isConfigured()) {
    const current = await fsRead<EventDay[]>(`events-${storeId}`, []);
    const id = (current.reduce((m, e) => Math.max(m, e.id ?? 0), 0) || 0) + 1;
    const created = { ...ev, id };
    await fsWrite(`events-${storeId}`, [...current, created]);
    return created;
  }
  await ready();
  const rows = await getSql()<{ id: number }[]>`
    insert into previsionnel_events (store_id, date, label, impact)
    values (${storeId}, ${ev.date}, ${ev.label}, ${ev.impact}) returning id
  `;
  return { ...ev, id: rows[0].id };
}

export async function updateEvent(storeId: string, id: number, patch: Partial<Omit<EventDay, "id">>): Promise<void> {
  if (!isConfigured()) {
    const current = await fsRead<EventDay[]>(`events-${storeId}`, []);
    await fsWrite(`events-${storeId}`, current.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    return;
  }
  await ready();
  const sql = getSql();
  if (patch.impact !== undefined) await sql`update previsionnel_events set impact = ${patch.impact} where id = ${id}`;
  if (patch.label !== undefined) await sql`update previsionnel_events set label = ${patch.label} where id = ${id}`;
  if (patch.date !== undefined) await sql`update previsionnel_events set date = ${patch.date} where id = ${id}`;
}

export async function deleteEvent(storeId: string, id: number): Promise<void> {
  if (!isConfigured()) {
    const current = await fsRead<EventDay[]>(`events-${storeId}`, []);
    await fsWrite(`events-${storeId}`, current.filter((e) => e.id !== id));
    return;
  }
  await ready();
  await getSql()`delete from previsionnel_events where id = ${id}`;
}

// ── Réglages ───────────────────────────────────────────────────────────────────

export function sanitizeSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof Settings, lo: number, hi: number) => {
    const v = Number(o[k]);
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : (DEFAULT_SETTINGS[k] as number);
  };
  const override = o.openingBalanceOverride;
  return {
    cbDelayDays: Math.round(num("cbDelayDays", 0, 10)),
    trDelayDays: Math.round(num("trDelayDays", 0, 60)),
    matiereLagMonths: Math.round(num("matiereLagMonths", 0, 2)),
    defaultEventImpact: num("defaultEventImpact", -1, 1),
    smallThreshold: num("smallThreshold", 0, 100000),
    alertThreshold: num("alertThreshold", -1e9, 1e9),
    openingBalanceOverride: override === null || override === undefined || override === "" ? null : Number(override),
    weatherEnabled: o.weatherEnabled === undefined ? DEFAULT_SETTINGS.weatherEnabled : Boolean(o.weatherEnabled),
    scenarioSpread: num("scenarioSpread", 0, 0.5),
  };
}

export async function getSettings(storeId: string): Promise<Settings> {
  if (!isConfigured()) return sanitizeSettings(await fsRead(`settings-${storeId}`, DEFAULT_SETTINGS));
  await ready();
  const rows = await getSql()<{ data: unknown }[]>`select data from previsionnel_settings where store_id = ${storeId}`;
  return sanitizeSettings(rows[0]?.data ?? DEFAULT_SETTINGS);
}

export async function saveSettings(storeId: string, settings: Settings): Promise<void> {
  if (!isConfigured()) {
    await fsWrite(`settings-${storeId}`, settings);
    return;
  }
  await ready();
  const sql = getSql();
  await sql`
    insert into previsionnel_settings (store_id, data, updated_at)
    values (${storeId}, ${sql.json(settings as unknown as Parameters<typeof sql.json>[0])}, now())
    on conflict (store_id) do update set data = excluded.data, updated_at = now()
  `;
}

// ── Cache JSON (météo, transactions) ───────────────────────────────────────────

export async function cacheGet<T>(key: string, maxAgeSec: number): Promise<T | null> {
  if (!isConfigured()) {
    const hit = await fsRead<{ fetchedAt: number; data: T } | null>(`cache-${key.replace(/[^a-z0-9]+/gi, "_")}`, null);
    if (!hit) return null;
    return Date.now() - hit.fetchedAt < maxAgeSec * 1000 ? hit.data : null;
  }
  await ready();
  const rows = await getSql()<{ data: T; fetched_at: string }[]>`
    select data, fetched_at from previsionnel_cache where key = ${key}
  `;
  if (!rows[0]) return null;
  const age = Date.now() - new Date(rows[0].fetched_at).getTime();
  return age < maxAgeSec * 1000 ? rows[0].data : null;
}

export async function cacheSet(key: string, data: unknown): Promise<void> {
  if (!isConfigured()) {
    await fsWrite(`cache-${key.replace(/[^a-z0-9]+/gi, "_")}`, { fetchedAt: Date.now(), data });
    return;
  }
  await ready();
  const sql = getSql();
  await sql`
    insert into previsionnel_cache (key, fetched_at, data)
    values (${key}, now(), ${sql.json(data as Parameters<typeof sql.json>[0])})
    on conflict (key) do update set fetched_at = now(), data = excluded.data
  `;
}
