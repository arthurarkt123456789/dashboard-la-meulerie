import "server-only";
import type { RuleKind } from "./types";

// Appels à l'API Claude (Messages) : classification des contreparties, veille presse, lecture du plan.
// Variables : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (défaut claude-sonnet-5-5).

const API = "https://api.anthropic.com/v1/messages";

export function llmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function model(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

type ContentBlock = { type: string; text?: string };

async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  webSearch?: { maxUses: number };
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante");
  const body: Record<string, unknown> = {
    model: model(),
    max_tokens: opts.maxTokens ?? 2000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  };
  if (opts.webSearch) {
    body.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: opts.webSearch.maxUses,
        user_location: { type: "approximate", city: "Marseille", region: "Provence-Alpes-Côte d'Azur", country: "FR", timezone: "Europe/Paris" },
      },
    ];
  }
  const res = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: ContentBlock[] };
  return (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

/** Extrait le premier tableau ou objet JSON d'une réponse texte. */
function extractJson<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fence?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = Math.min(...["[", "{"].map((ch) => (c.indexOf(ch) === -1 ? Infinity : c.indexOf(ch))));
    if (!Number.isFinite(start)) continue;
    const end = Math.max(c.lastIndexOf("]"), c.lastIndexOf("}"));
    if (end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {
      /* essai suivant */
    }
  }
  return null;
}

// ── Classification ─────────────────────────────────────────────────────────────

export type LlmClassifyInput = {
  key: string;
  samples: string[];
  count: number;
  total: number;
  monthsPresent: number;
  monthsWindow: number;
  typicalAmount: number;
};
export type LlmClassifyOutput = { key: string; kind: RuleKind; confidence: number; reason: string };

const KINDS: RuleKind[] = ["matiere", "fixe", "hors_exploitation", "variable", "ignorer"];

export async function classifyWithLLM(storeName: string, items: LlmClassifyInput[]): Promise<LlmClassifyOutput[]> {
  if (!items.length) return [];
  const system = `Tu es le trésorier d'une fromagerie-snacking à Marseille (La Meulerie, boutique ${storeName}).
Tu classes des contreparties bancaires sortantes d'après leur libellé et leur régularité. Natures possibles :
- matiere : fournisseur de produits revendus ou transformés (fromages, crémerie, pain, boissons, épicerie, emballages, grossistes type Metro/Promocash).
- fixe : charge d'exploitation récurrente (loyer, salaires, URSSAF, retraite, mutuelle, énergie, eau, télécom, assurance, logiciels, comptable, nettoyage, impôts et taxes).
- hors_exploitation : flux de structure (management fees, holding, licence ou redevance de marque, remboursement d'emprunt, compte courant d'associé, dividendes, investissements, virements vers une autre société du groupe).
- variable : coût qui suit le chiffre d'affaires hors matière (commissions CB, frais bancaires sur flux, plateformes de livraison, titres-restaurant).
- ignorer : virement interne entre comptes de la même société, dépense personnelle, erreur, remboursement.
Réponds uniquement en JSON : un tableau d'objets {"key","kind","confidence","reason"} avec confidence entre 0 et 1 et reason en une phrase française courte. Si tu ne sais vraiment pas, mets confidence ≤ 0.5.`;
  const user = JSON.stringify(
    items.map((i) => ({
      key: i.key,
      libelles: i.samples,
      operations: i.count,
      total_13_mois: Math.round(i.total),
      montant_typique: Math.round(i.typicalAmount),
      mois_presents: `${i.monthsPresent}/${i.monthsWindow}`,
    })),
  );
  const text = await callClaude({ system, user, maxTokens: 4000 });
  const parsed = extractJson<Record<string, unknown>[]>(text) ?? [];
  const out: LlmClassifyOutput[] = [];
  for (const p of parsed) {
    const key = typeof p.key === "string" ? p.key : null;
    const kind = typeof p.kind === "string" && (KINDS as string[]).includes(p.kind) ? (p.kind as RuleKind) : null;
    if (!key || !kind) continue;
    const confidence = Math.max(0, Math.min(1, Number(p.confidence) || 0));
    out.push({ key, kind, confidence, reason: typeof p.reason === "string" ? p.reason.slice(0, 200) : "" });
  }
  return out;
}

// ── Veille presse : manifestations, grèves, événements ─────────────────────────

export type ScoutedEvent = {
  date: string;
  label: string;
  type: "manifestation" | "greve" | "evenement" | "fermeture" | "autre";
  impact: number;
  confidence: number;
  url: string | null;
};

export async function scoutEvents(month: string, today: string, address: string): Promise<{ events: ScoutedEvent[]; raw: string }> {
  const system = `Tu es un veilleur presse pour un commerce de bouche situé ${address}, Marseille. Tu cherches ce qui peut modifier la fréquentation à pied du centre-ville de Marseille (Vieux-Port, Canebière, Préfecture, rue Paradis, rue Saint-Ferréol, Opéra) sur un mois donné : manifestations déclarées, grèves (RTM, SNCF, nationales), blocages, matchs ou événements majeurs (OM au Vélodrome n'impacte que faiblement le centre), marchés de Noël, Fête des Lumières, alertes météo orange/rouge, fermetures de rues.
Méthode : plusieurs recherches web en français (presse locale : La Provence, Made in Marseille, Marsactu, France Bleu Provence, 20 Minutes Marseille ; préfecture des Bouches-du-Rhône ; syndicats). Ne retiens que des dates précises et annoncées, pas des rumeurs. Les dates déjà passées du mois sont utiles aussi (pour mesurer l'impact).
Réponds uniquement en JSON : tableau d'objets {"date":"YYYY-MM-DD","label":"…","type":"manifestation|greve|evenement|fermeture|autre","impact":nombre entre -0.6 et 0.3 (effet estimé sur le CA du jour, négatif = baisse ; manif centre-ville ≈ -0.3, grève transports ≈ -0.15, événement attractif ≈ +0.1),"confidence":0 à 1,"url":"source"}. Tableau vide si rien de fiable.`;
  const user = `Mois : ${month}. Date du jour : ${today}. Liste les dates à risque ou à opportunité pour ${month} à Marseille centre.`;
  const raw = await callClaude({ system, user, maxTokens: 3000, webSearch: { maxUses: 8 } });
  const parsed = extractJson<Record<string, unknown>[]>(raw) ?? [];
  const types = ["manifestation", "greve", "evenement", "fermeture", "autre"];
  const events: ScoutedEvent[] = [];
  for (const p of parsed) {
    const date = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
    if (!date || !date.startsWith(month)) continue;
    const impactRaw = Number(p.impact);
    events.push({
      date,
      label: typeof p.label === "string" ? p.label.slice(0, 80) : "Événement",
      type: typeof p.type === "string" && types.includes(p.type) ? (p.type as ScoutedEvent["type"]) : "autre",
      impact: Number.isFinite(impactRaw) ? Math.max(-0.6, Math.min(0.3, impactRaw)) : -0.3,
      confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)),
      url: typeof p.url === "string" && /^https?:\/\//.test(p.url) ? p.url : null,
    });
  }
  return { events, raw };
}

// ── Lecture du plan ────────────────────────────────────────────────────────────

export async function narratePlan(summary: Record<string, unknown>): Promise<string> {
  const system = `Tu es le trésorier de La Meulerie. On te donne les chiffres clés d'un plan de trésorerie mensuel d'une boutique. Écris une lecture en 4 à 6 phrases courtes, en français, factuelle : situation, point bas et sa cause, ce qui pèse le plus, ce qui est incertain, et s'il y a une décision à prendre (décaler une échéance, ne pas payer un flux hors exploitation ce mois-ci, etc.). Pas de titre, pas de liste, pas de formule de politesse, pas de tiret cadratin.`;
  return (await callClaude({ system, user: JSON.stringify(summary), maxTokens: 600 })).trim();
}
