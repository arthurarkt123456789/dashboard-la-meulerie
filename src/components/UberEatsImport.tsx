"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

type ImportedMonth = { month: string; totalSales: number; days: number };

type Props = {
  importedMonths?: ImportedMonth[];
};

const FR_MONTHS = [
  "", "jan.", "fév.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sep.", "oct.", "nov.", "déc.",
];

function formatMonth(iso: string): string {
  const [y, m] = iso.split("-");
  return `${FR_MONTHS[parseInt(m)] ?? m} ${y}`;
}

export function UberEatsImport({ importedMonths }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; saved: number; from: string; to: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [open, setOpen] = useState(false);

  async function handleFile(file: File) {
    setStatus({ kind: "loading" });
    try {
      const text = await file.text();
      const res = await fetch("/api/import/uber-eats", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setStatus({ kind: "error", message: json.error ?? `Erreur ${res.status}` });
        return;
      }
      setStatus({ kind: "success", saved: json.saved, from: json.from, to: json.to });
      // Invalidate store-data so the dashboard reloads with UE data included
      await queryClient.invalidateQueries({ queryKey: ["store-data"] });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message ?? "Erreur réseau" });
    }
  }

  return (
    <div
      className="lm-card"
      style={{ borderLeft: "3px solid #16a34a", padding: "16px 20px" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          width: "100%",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 16 }}>🟢</span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--fg-primary)",
          }}
        >
          Ventes Uber Eats
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--fg-tertiary)",
            fontFamily: "var(--font-body)",
          }}
        >
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          {importedMonths && importedMonths.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-body)",
                  color: "var(--fg-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Données importées
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {importedMonths.map((m) => (
                  <div
                    key={m.month}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      color: "var(--fg-secondary)",
                    }}
                  >
                    <span>{formatMonth(m.month)}</span>
                    <span style={{ color: "#16a34a", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {m.totalSales.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € TTC
                      <span style={{ color: "var(--fg-tertiary)", fontWeight: 400, marginLeft: 4 }}>
                        · {m.days}j
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              borderTop: importedMonths && importedMonths.length > 0
                ? "1px solid var(--border-light)"
                : "none",
              paddingTop: importedMonths && importedMonths.length > 0 ? 12 : 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-body)",
                color: "var(--fg-secondary)",
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Importez le rapport CSV Uber Eats (colonnes <em>Ventes</em> et <em>Commandes</em>).
              Les données seront ajoutées au CA d&apos;Endoume.
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />

            <button
              className="lm-seg-btn active"
              style={{
                fontSize: 12,
                padding: "6px 14px",
                background: "#16a34a",
                borderColor: "#16a34a",
                color: "#fff",
                cursor: status.kind === "loading" ? "wait" : "pointer",
                opacity: status.kind === "loading" ? 0.7 : 1,
              }}
              disabled={status.kind === "loading"}
              onClick={() => inputRef.current?.click()}
            >
              {status.kind === "loading" ? "Import en cours…" : "Sélectionner un CSV"}
            </button>

            {status.kind === "success" && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 6,
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "#15803d",
                }}
              >
                ✓ {status.saved} jour{status.saved > 1 ? "s" : ""} importé{status.saved > 1 ? "s" : ""}
                {" "}({status.from} → {status.to})
              </div>
            )}

            {status.kind === "error" && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "#b91c1c",
                }}
              >
                ✗ {status.message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
