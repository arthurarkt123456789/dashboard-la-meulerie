import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-subtle)",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--color-white)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          padding: 28,
          width: "100%",
          maxWidth: 360,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: "var(--color-dark)",
              color: "var(--color-coral)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="10" />
              <path d="M6 12 Q 12 6 18 12 Q 12 18 6 12 Z" fill="currentColor" opacity="0.15" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: "0.04em",
                color: "var(--fg-primary)",
              }}
            >
              LA MEULERIE
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--fg-secondary)",
              }}
            >
              Pilotage des ventes
            </div>
          </div>
        </div>
        <LoginForm next={searchParams.next} hasError={searchParams.error === "1"} />
      </div>
    </div>
  );
}
