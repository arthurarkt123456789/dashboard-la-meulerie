// Extraction Pennylane (transactions bancaires + référentiels) pour l'analyse trésorerie.
// Usage : node treso/fetch.mjs            (toutes les boutiques)
//         node treso/fetch.mjs davso      (une seule)
// Tokens lus dans treso/.env.treso (PENNYLANE_TOKEN_DAVSO=..., etc.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, ".env.treso");
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const FROM = env.TRESO_FROM || "2025-10-01";
const TO = env.TRESO_TO || "2026-10-31";
const STORES = ["davso", "malmousque", "republique", "endoume"];
const BASE = "https://app.pennylane.com/api/external/v2";

async function all(token, p, extra = "") {
  const items = [];
  let cursor = null;
  for (let i = 0; i < 500; i++) {
    const u = `${BASE}/${p}?limit=100${extra}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`;
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); i--; continue; }
    if (!r.ok) throw new Error(`${p} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    items.push(...(j.items || []));
    if (!j.has_more || !j.next_cursor) break;
    cursor = j.next_cursor;
  }
  return items;
}

async function extract(store) {
  const token = env["PENNYLANE_TOKEN_" + store.toUpperCase()];
  if (!token) { console.log(`[${store}] pas de token, ignoré`); return; }
  const me = await (await fetch(BASE + "/me", { headers: { Authorization: "Bearer " + token } })).json();
  if (!me.company) { console.log(`[${store}] token refusé : ${JSON.stringify(me).slice(0, 120)}`); return; }
  const filter = "&filter=" + encodeURIComponent(JSON.stringify([
    { field: "date", operator: "gteq", value: FROM },
    { field: "date", operator: "lteq", value: TO },
  ]));
  const [transactions, categories, bank_accounts, suppliers, customers] = await Promise.all([
    all(token, "transactions", filter),
    all(token, "categories"),
    all(token, "bank_accounts"),
    all(token, "suppliers"),
    all(token, "customers"),
  ]);
  const out = {
    store, company: me.company, exported_at: new Date().toISOString(), from: FROM, to: TO,
    bank_accounts, categories,
    suppliers: suppliers.map(s => ({ id: s.id, name: s.name })),
    customers: customers.map(c => ({ id: c.id, name: c.name })),
    transactions,
  };
  const f = path.join(here, "data", `pennylane-${store}.json`);
  fs.writeFileSync(f, JSON.stringify(out));
  console.log(`[${store}] ${me.company.name} : ${transactions.length} transactions, ${bank_accounts.length} comptes, ${suppliers.length} fournisseurs → ${path.relative(process.cwd(), f)}`);
}

const wanted = process.argv[2] ? [process.argv[2]] : STORES;
for (const s of wanted) {
  try { await extract(s); } catch (e) { console.log(`[${s}] erreur : ${e.message}`); }
}
