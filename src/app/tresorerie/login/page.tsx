"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TresoLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/treso-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/tresorerie");
      } else {
        setError("Mot de passe incorrect.");
        setLoading(false);
      }
    } catch {
      setError("Erreur réseau, réessayez.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-subtle)",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          background: "var(--color-white)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          padding: "32px 28px",
          width: "100%",
          maxWidth: 360,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 28,
            gap: 8,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-la-meulerie.png"
            alt="La Meulerie"
            style={{ height: 60, width: "auto", display: "block" }}
          />
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--fg-tertiary)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Trésorerie · Accès restreint
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--fg-secondary)",
                marginBottom: 6,
                fontFamily: "var(--font-body)",
              }}
            >
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: `1px solid ${error ? "#dc2626" : "var(--border-medium)"}`,
                borderRadius: "var(--radius-md)",
                fontSize: 14,
                fontFamily: "var(--font-body)",
                outline: "none",
                boxSizing: "border-box",
                background: "var(--color-white)",
              }}
            />
            {error && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#dc2626", fontFamily: "var(--font-body)" }}>
                {error}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              padding: "11px 0",
              background: "var(--color-coral)",
              color: "var(--color-white)",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !password ? "not-allowed" : "pointer",
              opacity: loading || !password ? 0.65 : 1,
              fontFamily: "var(--font-body)",
              transition: "opacity 150ms ease",
            }}
          >
            {loading ? "Vérification…" : "Accéder"}
          </button>
        </form>
      </div>
    </div>
  );
}
