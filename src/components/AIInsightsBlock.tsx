"use client";

import { useMemo } from "react";
import { fmtEUR } from "@/lib/format";

type Insight = {
  icon: string;
  text: string;
};

type Props = {
  storeName: string;
  caTotal: number;
  caDelta: number | null;
  yoyCaDelta: number | null;
  yoyAvailable: boolean;
  avgTicket: number;
  txPerDay: number;
  fromagerieShare: number;
  snackingShare: number;
  caPerDay: number;
  periodLabel: string;
};

function pct(v: number): string {
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(1).replace(".", ",") + " %";
}

function generateInsights(props: Props): Insight[] {
  const {
    caDelta,
    yoyCaDelta,
    yoyAvailable,
    avgTicket,
    fromagerieShare,
    snackingShare,
    txPerDay,
  } = props;

  const insights: Insight[] = [];

  // Tendance de la période
  if (caDelta !== null) {
    if (caDelta > 0.05) {
      insights.push({
        icon: "↑",
        text: `Le CA est en hausse de ${pct(caDelta)} sur la période. La dynamique est positive — à maintenir par une gestion maîtrisée des charges variables.`,
      });
    } else if (caDelta < -0.05) {
      insights.push({
        icon: "↓",
        text: `Le CA est en repli de ${pct(Math.abs(caDelta))} sur la période. Un point de vigilance s'impose sur le mix produit ou la fréquentation.`,
      });
    } else {
      insights.push({
        icon: "→",
        text: `Le CA reste stable sur la période (${pct(caDelta)}). La performance est en ligne avec les tendances habituelles.`,
      });
    }
  }

  // Comparaison N-1
  if (yoyAvailable && yoyCaDelta !== null) {
    if (yoyCaDelta > 0.1) {
      insights.push({
        icon: "📈",
        text: `Sur un an, le CA progresse de ${pct(yoyCaDelta)} — une croissance significative qui signale un ancrage solide de l'enseigne dans son bassin de clientèle.`,
      });
    } else if (yoyCaDelta < -0.05) {
      insights.push({
        icon: "📉",
        text: `Le CA recule de ${pct(Math.abs(yoyCaDelta))} vs N-1. Il convient d'analyser si ce repli est saisonnier, structurel ou lié à un changement de mix.`,
      });
    }
  }

  // Mix Fromagerie / Snacking
  if (fromagerieShare > 0 && snackingShare > 0) {
    const dominant = fromagerieShare > snackingShare ? "Fromagerie" : "Snacking";
    const domShare = Math.max(fromagerieShare, snackingShare);
    if (domShare > 0.65) {
      insights.push({
        icon: "⚖️",
        text: `Le ${dominant} représente ${(domShare * 100).toFixed(0)} % du CA — une concentration élevée. Diversifier les segments pourrait limiter l'exposition aux aléas d'un seul pilier.`,
      });
    } else {
      insights.push({
        icon: "⚖️",
        text: `Le mix Fromagerie (${(fromagerieShare * 100).toFixed(0)} %) / Snacking (${(snackingShare * 100).toFixed(0)} %) est relativement équilibré, ce qui réduit la dépendance à un seul segment.`,
      });
    }
  }

  // Panier moyen
  if (avgTicket > 0) {
    if (avgTicket > 22) {
      insights.push({
        icon: "🛒",
        text: `Le panier moyen de ${fmtEUR(avgTicket)} est élevé. C'est le signe d'une clientèle engagée — veiller à ne pas éroder ce niveau avec des promotions excessives.`,
      });
    } else if (avgTicket < 12) {
      insights.push({
        icon: "🛒",
        text: `Le panier moyen de ${fmtEUR(avgTicket)} est modeste. Des actions de montée en gamme ou de vente additionnelle (fromage + vin, plateau…) pourraient le renforcer.`,
      });
    } else {
      insights.push({
        icon: "🛒",
        text: `Le panier moyen de ${fmtEUR(avgTicket)} est dans une fourchette standard. Des opportunités d'upsell existent sur les associations fromage/vins ou les formats à emporter.`,
      });
    }
  }

  // Fréquentation
  if (txPerDay > 0) {
    if (txPerDay > 80) {
      insights.push({
        icon: "👥",
        text: `La fréquentation est soutenue (${Math.round(txPerDay)} tx/jour). À ce niveau, l'efficacité opérationnelle en heure de pointe devient un levier de marge.`,
      });
    } else if (txPerDay < 30) {
      insights.push({
        icon: "👥",
        text: `La fréquentation reste faible (${Math.round(txPerDay)} tx/jour). Des actions de visibilité locale (réseaux sociaux, vitrines, partenariats) pourraient stimuler le flux.`,
      });
    }
  }

  return insights.slice(0, 4);
}

export function AIInsightsBlock(props: Props) {
  const insights = useMemo(() => generateInsights(props), [props]);

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        background: "#F4F4F2",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 20px 12px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--fg-primary)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Analyse stratégique · {props.storeName}
          </h3>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--fg-tertiary)",
              marginTop: 4,
            }}
          >
            Lecture I.A. sur {props.periodLabel} · générée automatiquement à partir des KPIs
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 4,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            color: "var(--fg-secondary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 13 }}>⚠</span>
          Work in progress
        </div>
      </div>

      <div
        style={{
          padding: "16px 20px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {insights.map((ins, i) => (
          <div
            key={i}
            style={{
              background: "var(--color-white)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                fontSize: 16,
                lineHeight: 1.4,
                flexShrink: 0,
              }}
            >
              {ins.icon}
            </span>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--fg-secondary)",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              {ins.text}
            </p>
          </div>
        ))}
        {insights.length === 0 && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--fg-tertiary)",
              fontStyle: "italic",
              padding: "8px 0",
            }}
          >
            Données insuffisantes pour générer une analyse.
          </div>
        )}
      </div>

      <div
        style={{
          padding: "8px 20px 12px",
          borderTop: "1px solid var(--border-light)",
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--fg-tertiary)",
          fontStyle: "italic",
        }}
      >
        Ces observations sont générées par règles heuristiques à partir des données APITIC. Elles ne remplacent pas un jugement opérationnel. Ce bloc évoluera vers une analyse IA réelle.
      </div>
    </div>
  );
}
