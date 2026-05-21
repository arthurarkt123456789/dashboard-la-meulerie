"use client";

import { useState } from "react";

type Props = {
  next?: string;
  hasError: boolean;
};

export function LoginForm({ next, hasError: initialError }: Props) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialError);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(true);
        setSubmitting(false);
        return;
      }
      window.location.href = next && next.startsWith("/") ? next : "/all";
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--fg-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 500,
          }}
        >
          Mot de passe
        </span>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{
            padding: "10px 12px",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--fg-primary)",
            background: "var(--color-white)",
          }}
        />
      </label>
      {error && (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--color-coral)",
          }}
        >
          Mot de passe incorrect.
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || !password}
        style={{
          padding: "10px 12px",
          background: "var(--color-coral)",
          color: "var(--color-white)",
          border: 0,
          borderRadius: "var(--radius-sm)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
          fontWeight: 500,
          cursor: submitting || !password ? "not-allowed" : "pointer",
          opacity: submitting || !password ? 0.6 : 1,
        }}
      >
        {submitting ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
