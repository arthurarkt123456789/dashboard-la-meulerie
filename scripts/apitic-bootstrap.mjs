#!/usr/bin/env node
// Warms the APITIC cache on a deployed instance by calling /api/admin/bootstrap
// once per configured store.
//
// Usage:
//   DASHBOARD_URL=https://your.up.railway.app ADMIN_TOKEN=... \
//     node scripts/apitic-bootstrap.mjs
//
// Tolerant of slow responses — each store can take several minutes the first
// time. Re-running is safe (already-cached days are skipped on disk).

const url = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
const token = process.env.ADMIN_TOKEN;

if (!url || !token) {
  console.error("DASHBOARD_URL and ADMIN_TOKEN must be set.");
  process.exit(1);
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
  console.log(`  Found ${stores.length} store(s): ${stores.join(", ")}`);

  for (const storeId of stores) {
    const start = Date.now();
    process.stdout.write(`→ Warming cache for ${storeId} … `);
    try {
      const result = await callJson(
        `/api/admin/bootstrap?storeId=${encodeURIComponent(storeId)}`,
      );
      const seconds = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`OK (${result.days} days, ${seconds}s)`);
    } catch (err) {
      console.log(`FAILED`);
      console.error(`  ${err.message}`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
