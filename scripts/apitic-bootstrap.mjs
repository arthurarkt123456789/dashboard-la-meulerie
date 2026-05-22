#!/usr/bin/env node
// Warms the APITIC sales cache on a deployed instance.
// Calls /api/admin/bootstrap one chunk at a time for each configured store.
//
// Usage:
//   DASHBOARD_URL=https://your.up.railway.app ADMIN_TOKEN=... \
//     node scripts/apitic-bootstrap.mjs
//
//   Options (env vars):
//     CHUNK_DAYS   default 30  — number of days per HTTP call
//     HISTORY_DAYS default 540 — total days back from today to backfill
//     ONLY_STORE              — restrict to one store id (e.g. davso)
//
// Re-runnable. Already-cached days are skipped server-side, so re-running
// after a network blip just continues where it left off.

const url = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
const token = process.env.ADMIN_TOKEN;
// 10-day chunks: at MAX_CONCURRENT=3, worst case is ~4 batches×60s = 240s,
// well inside the 300s server timeout. Use CHUNK_DAYS env to override.
const chunkDays = Number(process.env.CHUNK_DAYS || "10");
const historyDays = Number(process.env.HISTORY_DAYS || "540");
const only = process.env.ONLY_STORE || null;

if (!url || !token) {
  console.error("DASHBOARD_URL and ADMIN_TOKEN must be set.");
  process.exit(1);
}

function todayInParis() {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;
}

function subtractDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function callJson(path) {
  const res = await fetch(`${url}${path}`, {
    headers: { "X-Admin-Token": token },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* leave json null */
  }
  if (!res.ok) {
    const detail = json?.error || text || res.statusText;
    throw new Error(`${path} → ${res.status} ${detail}`);
  }
  return json;
}

async function main() {
  console.log(`→ Discovering configured stores at ${url}`);
  const { stores } = await callJson("/api/admin/bootstrap");
  if (!stores || stores.length === 0) {
    console.error(
      "No stores configured. Set APITIC_ACCOUNT_* env vars on the server first.",
    );
    process.exit(2);
  }
  const targets = only ? stores.filter((s) => s === only) : stores;
  console.log(`  Target stores: ${targets.join(", ")}`);
  console.log(
    `  Backfilling ${historyDays} days in chunks of ${chunkDays} days per call`,
  );

  const today = todayInParis();
  const totals = {};
  for (const storeId of targets) {
    totals[storeId] = { fetched: 0, skipped: 0, failed: 0 };
    console.log(`\n→ ${storeId}`);
    for (let offset = 0; offset < historyDays; offset += chunkDays) {
      const to = subtractDays(today, offset);
      const from = subtractDays(today, Math.min(offset + chunkDays - 1, historyDays - 1));
      process.stdout.write(`  ${from} → ${to}  `);
      const start = Date.now();
      try {
        const result = await callJson(
          `/api/admin/bootstrap?storeId=${encodeURIComponent(storeId)}&from=${from}&to=${to}`,
        );
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        console.log(
          `fetched=${result.fetched} skipped=${result.skipped} failed=${result.failed} (${sec}s)`,
        );
        totals[storeId].fetched += result.fetched;
        totals[storeId].skipped += result.skipped;
        totals[storeId].failed += result.failed;
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        totals[storeId].failed += 1;
        // small backoff so we don't hammer during blackouts
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  console.log("\n=== Summary ===");
  for (const [id, t] of Object.entries(totals)) {
    console.log(
      `  ${id}: fetched=${t.fetched} skipped=${t.skipped} failed=${t.failed}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
