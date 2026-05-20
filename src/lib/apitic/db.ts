import "server-only";
import postgres from "postgres";

// Single shared Postgres client. The `postgres` lib pools connections itself.
// We read DATABASE_URL from env (Railway/Supabase/etc. inject it).

let sql: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

function client() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  sql = postgres(url, {
    max: 8,
    idle_timeout: 30,
    connect_timeout: 10,
    // Railway/Supabase connection poolers don't always advertise SSL but
    // the underlying Postgres requires it. Trust the cert chain by default;
    // override with DATABASE_SSL=disable if running against a local DB.
    ssl:
      process.env.DATABASE_SSL === "disable"
        ? false
        : { rejectUnauthorized: false },
    prepare: false, // pgbouncer transaction pooler compat (Supabase, etc.)
  });
  return sql;
}

async function ensureSchema(): Promise<void> {
  const s = client();
  await s`
    create table if not exists apitic_sales_cache (
      account_id text not null,
      date date not null,
      fetched_at timestamptz not null default now(),
      sales jsonb not null,
      primary key (account_id, date)
    )
  `;
  await s`
    create index if not exists apitic_sales_cache_fetched_at
      on apitic_sales_cache (fetched_at)
  `;
}

export function getSql() {
  return client();
}

export function ready(): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensureSchema().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
