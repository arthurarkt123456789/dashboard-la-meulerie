# Dashboard La Meulerie

Pilotage interne pour la chaîne **La Meulerie** (4 fromageries-snacking à Marseille). Données alimentées par APITIC. Cible : dirigeant + 4 responsables magasin.

Stack : **Next.js 14 (App Router) · TypeScript strict · TanStack Query · charts SVG custom**.

---

## Démarrer

```bash
npm install
npm run dev
# → http://localhost:3000
```

Les autres commandes :

| Commande            | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Serveur dev avec HMR                       |
| `npm run build`     | Build de production                        |
| `npm start`         | Sert le build prod (`next start`)          |
| `npm run typecheck` | `tsc --noEmit` strict                      |
| `npm run lint`      | ESLint via `eslint-config-next`            |

Si jamais `npm install` échoue à cause d'un cache npm corrompu (`EEXIST` sur `~/.npm/_cacache/...`), utiliser :

```bash
npm install --cache /tmp/npm-cache-meulerie
```

---

## Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout + Providers (TanStack Query)
│   ├── page.tsx            # / → redirect vers /all
│   ├── [tab]/page.tsx      # /all, /davso, /endoume, /malmousque, /republique
│   ├── globals.css         # Design tokens + styles dashboard (lm-*)
│   ├── providers.tsx       # QueryClientProvider
│   └── api/
│       ├── stores/         # GET /api/stores      → Store[]
│       ├── store-data/     # GET /api/store-data  → StoreData[]  (payload riche)
│       └── today/          # GET /api/today       → { iso }
│
├── components/
│   ├── Dashboard.tsx       # Shell client : header + view switcher
│   ├── Header.tsx          # Logo, date, statut APITIC, tabs, période
│   ├── Tabs.tsx · PeriodToggle.tsx · SegmentFilter.tsx
│   ├── ConsolidatedView.tsx · StoreView.tsx
│   ├── KPICard.tsx · Card.tsx · ScopeNote.tsx
│   ├── TopProducts.tsx · PaymentsCard.tsx · SegmentSplit.tsx
│   ├── LegendInline.tsx
│   └── charts/
│       ├── Sparkline.tsx
│       ├── LineChart.tsx    # multi-séries + overlay N-1 pointillé + tooltip
│       ├── HBarChart.tsx    # barres horizontales + repère N-1
│       ├── Donut.tsx        # moyens de paiement
│       └── HourlyBars.tsx   # affluence intraday
│
└── lib/
    ├── apitic/
    │   ├── types.ts        # Store, StoreData, StoreDaily, Product, PaymentSplit
    │   ├── mock.ts         # générateur déterministe (port de data.js du proto)
    │   └── client.ts       # ⚠️  point de bascule mock ↔ APITIC réel
    ├── metrics.ts          # periodMetrics, consolidatedPeriodMetrics, sumYoY…
    ├── format.ts           # fmtEUR, fmtPct, formatDateLabel…
    └── queries.ts          # useStores / useStoreData / useToday (TanStack Query)
```

---

## Brancher APITIC (BI Data API v0.9.3)

L'adapter APITIC est déjà wiré. Tout ce qui suit suffit pour passer du mock au réel.

### 1. Configurer `.env.local`

```bash
cp .env.example .env.local
```

Renseigner :

```env
APITIC_ENABLED=true
# Production: https://bi-data-api.web-caisse.com/api/v1
# Staging:    https://preprod-bi-data-api.web-caisse.com/api/v1
APITIC_BASE_URL=https://preprod-bi-data-api.web-caisse.com/api/v1
APITIC_EMAIL=ton.email@apitic.com
APITIC_PASSWORD=•••••••
```

À ce stade les mappings sont vides — laisser tels quels pour la phase de découverte.

### 2. Découvrir les comptes et catégories

Lancer `npm run dev`, puis dans un navigateur (ou `curl`) :

```bash
curl http://localhost:3000/api/admin/discover | jq
```

Cette route renvoie tous tes comptes APITIC avec leurs catégories et moyens de paiement. Identifier l'ID APITIC de chacun des 4 magasins.

### 3. Compléter le mapping dans `.env.local`

```env
APITIC_ACCOUNT_DAVSO=<id-apitic-davso>
APITIC_ACCOUNT_ENDOUME=<id-apitic-endoume>
APITIC_ACCOUNT_MALMOUSQUE=<id-apitic-malmousque>
APITIC_ACCOUNT_REPUBLIQUE=<id-apitic-republique>

# Liste des category_id qui sont Fromagerie / Snacking
APITIC_CATEGORIES_FROMAGERIE=12,34,55
APITIC_CATEGORIES_SNACKING=2,7,18
APITIC_DEFAULT_SEGMENT=Snacking  # pour les catégories non listées
```

Redémarrer le dev server. C'est tout — `/api/store-data` agrège maintenant les données réelles.

### 4. Endpoints APITIC utilisés

| Donnée UI                  | Endpoint APITIC                              |
| -------------------------- | -------------------------------------------- |
| Liste magasins (filtrée)   | `GET /accounts`                              |
| Ventes par jour            | `GET /accounts/{id}/sales/{date}` (paginé)   |
| Catalogue produits         | `GET /accounts/{id}/products`                |
| Catégories                 | `GET /accounts/{id}/categories`              |
| Moyens de paiement         | `GET /accounts/{id}/payment-means`           |
| Auth                       | `POST /token` (`{ email, password }`)        |

### 5. Cache filesystem

Pour limiter les appels (APITIC ne propose pas d'agrégation, donc 1 appel par jour par magasin), les ventes sont mises en cache dans `.cache/apitic/{account_id}/{date}.json`.

- **Jours fermés** : cache permanent (immutable). Une fois fetchés, plus jamais re-fetchés.
- **Aujourd'hui** : TTL 60 s.
- **Override** : `APITIC_CACHE_DIR=/some/path` pour mettre le cache ailleurs.

Le **premier démarrage** sur un magasin va déclencher l'aggrégation de 540 jours (~minutes selon le volume — borné par la concurrence interne et le rate limit APITIC). Les requêtes suivantes touchent le cache et sont instantanées.

`APITIC_HISTORY_DAYS=90` pour réduire la fenêtre si tu veux un bootstrap plus rapide (mais N-1 ne sera pas dispo).

### 6. Contraintes APITIC (gérées automatiquement)

- **Rate limit** : 10 req/s par IP. Le client throttle à 8 concurrent in-flight et retry sur 429 avec backoff exponentiel.
- **Blackouts CET** : `05:00–06:00`, `11:30–14:30`, `18:30–22:30`. Pendant ces fenêtres, le client lève une `ApiticBlackoutError`. Le dashboard sert le cache disponible et, en dernier recours, retombe sur le mock (config `APITIC_FALLBACK_TO_MOCK=true` par défaut).
- **Auth** : token Bearer auto-géré (cache mémoire avec rafraîchissement 60 s avant expiration).

### 7. Fallback

Tant que `APITIC_FALLBACK_TO_MOCK=true` (défaut), si APITIC est indisponible (config incomplète, blackout, erreur réseau), l'UI continue de fonctionner avec le mock. Mettre à `false` pour forcer l'affichage d'une bannière d'erreur à la place.

### 8. Structure interne (pour faire évoluer)

```
src/lib/apitic/
├── types.ts          # Contrat UI (StoreData, etc.) — ne pas modifier
├── raw-types.ts      # Types des payloads APITIC bruts
├── http.ts           # Fetch authed + rate limit + blackouts + retry
├── endpoints.ts      # Wrappers typés des endpoints APITIC
├── cache.ts          # Cache filesystem pour les ventes
├── mapping.ts        # Config magasin ↔ account, catégorie → segment
├── aggregator.ts     # APITIC raw → StoreData
├── mock.ts           # Données mockées (fallback)
└── client.ts         # Point unique d'entrée pour les API routes
```

---

## Logique métier : périmètre constant N-1

Cœur fonctionnel. Voir `src/lib/metrics.ts` → `consolidatedPeriodMetrics()`.

Un magasin n'est inclus dans la comparaison N-1 que si **tous les jours** de la période N-1 (365 j plus tôt, même fenêtre) ont des données — c'est-à-dire si le magasin était déjà ouvert.

À l'affichage :
- KPI consolidé : `+X,X % vs N-1 · périmètre N/4`
- KPI magasin sans données N-1 : `— N-1 indisponible · ouvert depuis X mois`
- Bannière rouge clair en haut de la vue consolidée si des magasins sont exclus

République (ouvert nov. 2025) est exclu par construction des comparaisons N-1 sur 2026.

---

## Déployer sur Railway

Le projet est prêt pour Railway : `railway.json` à la racine, Next.js auto-détecté par Nixpacks, healthcheck sur `/api/today`.

### 1. Créer le projet

```bash
railway login            # ouvre le navigateur
railway init             # crée un projet vide OU
railway link             # lie un projet existant
```

Ensuite via le dashboard Railway (`https://railway.app`) :
- Crée un service depuis le repo GitHub `dashboard-la-meulerie`
- Laisse Railway auto-détecter Nixpacks

### 2. Créer un Volume persistant

Le cache APITIC doit survivre aux déploiements (sinon on refait 540 j × 4 magasins à chaque release).

Dans Railway → ton service → onglet **Volumes** :
- **New Volume**
- Mount path : `/data`
- Taille : 1 GB suffit largement (un JSON de 540 jours × 4 magasins ≈ quelques dizaines de Mo)

### 3. Variables d'environnement

Dans Railway → onglet **Variables**, coller :

```env
APITIC_ENABLED=true
APITIC_BASE_URL=https://bi-data-api.web-caisse.com/api/v1
APITIC_EMAIL=ton.email@apitic.com
APITIC_PASSWORD=•••••••
APITIC_CACHE_DIR=/data/apitic
APITIC_HISTORY_DAYS=540
APITIC_FALLBACK_TO_MOCK=true

# Génère un token aléatoire pour protéger /api/admin/*
# Ex (Linux/macOS): openssl rand -hex 32
ADMIN_TOKEN=remplace-moi-par-un-token-aléatoire-long
```

Pas encore besoin de renseigner les `APITIC_ACCOUNT_*` et `APITIC_CATEGORIES_*` — on les remplit après la phase de découverte.

### 4. Premier déploiement + découverte

Une fois Railway up, copie l'URL publique (ex: `https://dashboard-la-meulerie-production.up.railway.app`).

Dump tes comptes APITIC :

```bash
curl "https://<ton-url>/api/admin/discover?token=<ADMIN_TOKEN>" | jq
```

Tu vas voir un JSON avec tous tes magasins, leurs catégories et leurs moyens de paiement. **Note les `id` des 4 magasins** et les `category_id` qui correspondent à Fromagerie / Snacking.

### 5. Compléter les mappings

Retour dans Railway → Variables, ajoute :

```env
APITIC_ACCOUNT_DAVSO=abc-123
APITIC_ACCOUNT_ENDOUME=def-456
APITIC_ACCOUNT_MALMOUSQUE=ghi-789
APITIC_ACCOUNT_REPUBLIQUE=jkl-012

APITIC_CATEGORIES_FROMAGERIE=12,34,55
APITIC_CATEGORIES_SNACKING=2,7,18
```

Railway redéploie automatiquement.

### 6. Warmer le cache

Une fois le déploiement actif :

```bash
DASHBOARD_URL=https://<ton-url> ADMIN_TOKEN=<ton-token> npm run apitic:bootstrap
```

Ce script appelle `/api/admin/bootstrap?storeId=X` pour chacun des 4 magasins. Compte **quelques minutes par magasin** (540 jours de ventes à fetcher, 1-3 pages par jour, rate limit APITIC à 10 req/s). Le script tolère les timeouts ; relancer est safe (les jours déjà cachés sont sautés).

Une fois fini, le dashboard est instantané à l'usage.

### 7. Visiter le dashboard

`https://<ton-url>/all`

C'est tout. Les périodes basculent côté client (pas de re-fetch APITIC), le cache se rafraîchit toutes les 60 s pour la journée en cours.

---

## Prévisionnel de trésorerie (`/tresorerie/previsionnel`)

Plan de trésorerie jour par jour du mois en cours (ou d'un mois voisin), par magasin. Démarre sur Davso.

### L'agent Trésorier

Il décide seul ce qu'il peut prouver et ne pose une question que s'il ne peut pas. Base de travail : la **transaction bancaire**, à sa date. Les écritures comptables ne servent qu'à prouver la nature d'une contrepartie ; une transaction sans écriture lettrée reste dans les flux et apparaît dans la liste « sans écriture lettrée » du briefing.

Ordre de preuve pour classer une contrepartie (matière / charge fixe / hors exploitation / variable / ignorer) :

1. **Écritures Pennylane** (`GET /ledger_entry_lines`) : compte PCG de la transaction catégorisée, ou de la facture fournisseur lettrée à cette transaction (401 → 6xx). 613 → fixe, 607 → matière, 108/16x/455 → hors exploitation, 627 → variable, 58 → ignorer. Accepté si ≥ 70 % du montant pointe sur la même nature.
2. **Mots-clés** sans ambiguïté (URSSAF, DGFIP, METRO, loyer, EDF, management fees…).
3. **Claude** (API, modèle `ANTHROPIC_MODEL`) sur libellés et régularité, accepté si confiance ≥ 0,8.
4. Sinon **question**, uniquement si le montant est significatif (≥ `smallThreshold` ou 0,4 % des sorties de la fenêtre).

Chaque décision est enregistrée avec sa source et sa raison (`previsionnel_rules.source / confidence / reason`), modifiable d'un clic ; une correction manuelle est définitive.

**Veille presse** : une fois par jour et par mois cible, Claude avec recherche web cherche les manifestations, grèves, blocages, événements et alertes météo annoncés sur Marseille centre, et les enregistre comme événements « presse » avec impact estimé, confiance et source. Ils s'appliquent au plan tant qu'ils ne sont pas écartés.

### Flux

1. **Briefing** : ce que l'agent a classé (nouveautés en tête, tout corrigible), transactions sans écriture lettrée, veille presse, puis les quelques questions restantes. Si rien de nouveau, le plan s'affiche directement.
2. **Calcul**.
3. **Plan** : lecture du trésorier rédigée par Claude, KPI (solde actuel, solde fin de mois avec fourchette, point bas daté, CA prévu vs N-1, jours sous le seuil), courbe de solde avec bande de scénarios et ligne « aujourd'hui », barres de flux journaliers par nature, waterfall solde initial → solde final, tableau jour par jour dépliable, panneaux Hypothèses / Échéancier / Manifs / Classements / Réglages.

### Modèle

| Poste | Méthode |
| --- | --- |
| CA journalier | N-1 aligné sur le jour de semaine (J-364) × croissance (4 dernières semaines closes vs mêmes semaines N-1, hors jours perturbés). Sans N-1 : moyenne du jour de semaine sur 8 semaines. Fériés : même date calendaire N-1. |
| Météo | Open-Meteo (Marseille). Effet pluie (≥ 2 mm) et froid (tmax < 12 °C) calibrés sur l'historique du magasin (ratio CA réel / moyenne locale du jour de semaine), appliqués sur les 16 jours de prévision. Non appliqué si moins de 10 jours comparables. |
| Manifs | Impact saisi (défaut -30 %). Les manifs passées affichent l'impact constaté pour recaler. |
| Encaissements banque | CA × part CB à J+1, TR à J+10, virements à J ; espèces restent en caisse (affichées à part). Parts mesurées sur 28 jours de caisse. |
| Charges fixes / hors exploitation | Par contrepartie classée : médiane des montants mensuels, jour habituel (médiane), fréquence détectée (mensuel / hebdo / irrégulier). Une échéance déjà passée en banque ce mois n'est pas reprojetée ; une échéance en retard est décalée à demain. Montant et jour forçables dans l'échéancier. |
| Sorties irrégulières | Jamais reprojetées sur la seule base de l'an dernier. Retenues si une périodicité est prouvée (trimestriel, semestriel : même écart entre ≥ 3 occurrences) ; proposées, retirables, si la nature est annuelle (CFE, taxe foncière, assurance, SACEM, comptes 616/635/637) et qu'elles sont sorties le même mois N-1 ; sinon listées « non retenu ». Hors exploitation irrégulier (dividendes, IS, compte courant) : jamais sans décision explicite. Boutons « attendre ce mois-ci » / « retirer » dans l'échéancier (`previsionnel_rules.recurrence`). |
| Matière | Ratio paiements matière / CA caisse sur 3 mois clos (décalage 0 ou 1 mois réglable), réparti sur les jours de semaine où les fournisseurs prélèvent habituellement. |
| Variables / divers | Variables au ratio du CA ; petites contreparties non classées en moyenne par jour. |
| Scénarios | ±10 % (réglable) sur encaissements et sorties variables futures. |
| Solde | Solde Pennylane des comptes opérationnels (prêts exclus) daté de la dernière transaction connue ; soldes passés reconstitués à rebours. Solde forçable si la synchro bancaire manque. |

La trésorerie **d'exploitation** exclut les flux classés « hors exploitation » (management fees, licence de marque, emprunts, comptes courants) : ils apparaissent en colonne séparée et dans le waterfall.

### Prérequis

- Token Pennylane du magasin avec les scopes `transactions:readonly`, `bank_accounts:readonly`, `ledger_entries:readonly`, `ledger_accounts:readonly` en plus de `trial_balance:readonly` (`PENNYLANE_TOKEN_<MAGASIN>`).
- `ANTHROPIC_API_KEY` (et `ANTHROPIC_MODEL`, défaut `claude-sonnet-5-5`) pour la classification par Claude, la veille presse et la lecture du plan. Sans clé, l'agent classe par écritures et mots-clés et pose le reste en question ; pas de veille presse.
- `DATABASE_URL` (tables créées automatiquement : `previsionnel_rules`, `previsionnel_events`, `previsionnel_settings`, `previsionnel_cache`). Sans base : fichiers JSON dans `APITIC_CACHE_DIR/previsionnel`.
- Accès sortant vers `api.open-meteo.com` et `archive-api.open-meteo.com` (sinon le plan se calcule sans météo, avec un avertissement).

### Débit API Pennylane

Tous les appels Pennylane du module passent par `src/lib/pennylane/throttle.ts` : 2 requêtes en vol, 350 ms entre deux départs, reprise automatique sur 429 / 5xx. Transactions, soldes et écritures sont lus en séquence. Premier chargement d'un magasin : une à deux minutes (écritures sur 8 mois, ensuite en cache 24 h ; transactions en cache 30 min).

### Routes

| Route | Rôle |
| --- | --- |
| `GET /api/previsionnel?store=davso&month=2026-11[&force=1]` | Plan complet (`force` ignore le cache transactions de 30 min) |
| `GET /api/previsionnel/doutes?store=davso[&force=1][&scout=0]` | Briefing de l'agent : décisions, non lettrées, veille presse, questions (`force` relit Pennylane et relance la veille) |
| `POST /api/previsionnel/reponses?store=davso` | `{ answers: [{ key, kind, label?, expectedAmount?, expectedDay? }] }` |
| `GET/DELETE /api/previsionnel/regles?store=davso[&key=]` | Lister / reposer une question |
| `GET/POST/PATCH/DELETE /api/previsionnel/evenements?store=davso` | Manifs (`scope: "all"` pour tous les magasins) |
| `GET/PUT /api/previsionnel/reglages?store=davso` | Réglages |

Auto-test du moteur sur données synthétiques : `bun scripts/previsionnel-selftest.ts` (ou `npx tsx`).

---

## Auth — pas encore wirée

Le dashboard est accessible directement. Pour ajouter NextAuth/Clerk plus tard :

- Wrapper `<Dashboard>` dans une page protégée (`middleware.ts` + `auth()` côté serveur)
- 5 comptes : 1 dirigeant (accès complet) + 4 responsables (accès limité à leur magasin)
- Filtrer les tabs visibles dans `Tabs.tsx` selon le rôle utilisateur

---

## Données

- **`src/lib/apitic/mock.ts`** porte le générateur déterministe du proto d'origine. Réelles tendances : 540 jours d'historique, croissance par magasin, factor weekend, journée en cours partielle (`partial: true`).
- L'ancre `TODAY` est figée au **2026-05-19** pour reproductibilité (config via `MOCK_TODAY` en env). À retirer quand on bascule sur APITIC.

---

## Charts

Les charts sont en **SVG custom** (port du proto). Tooltips, crosshair de hover, overlay N-1 pointillé, gradients : tout est dans `src/components/charts/`.

Si vous voulez basculer sur Recharts ou visx : remplacer chaque composant un par un — l'API des props est minimale et stable. Le design (couleurs, tabular-nums, hauteurs) est porté par les CSS variables, donc il survivra à un changement de lib.

---

## Design tokens

Tout dans `src/app/globals.css` (84 variables — couleurs, typo, espacements, radius, ombres, transitions). Inspiration **Stripe / Linear**, sobre. Corail `#FF4433` réservé aux accents (CA principal, top de classement, alertes).

---

## Reste à faire

| Sujet                  | Status                                                 |
| ---------------------- | ------------------------------------------------------ |
| Branchement APITIC     | ⏳ — voir section ci-dessus                            |
| Auth utilisateurs      | ⏳ — stub pour MVP                                     |
| Bouton « Exporter »    | ⏳ — format à confirmer avec le client (PDF/CSV/PPT ?) |
| Bouton « Rafraîchir »  | ⏳ — câbler à `queryClient.invalidateQueries()`        |
| Locale fuseau          | ⏳ — vérifier Europe/Paris vs UTC dans APITIC          |
| Mapping Fromagerie/Snacking | ⏳ — table custom si APITIC ne tague pas         |

---

*Proto initial : ARKT Conseil · communication & design graphique · Marseille*
