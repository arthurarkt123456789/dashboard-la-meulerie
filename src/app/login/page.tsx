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
          maxWidth: 380,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28, gap: 8 }}>
          <img
            src="/logo-la-meulerie.png"
            alt="La Meulerie"
            style={{ height: 64, width: "auto", display: "block" }}
          />
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--fg-tertiary)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Pilotage des ventes
          </div>
        </div>

        <LoginForm next={searchParams.next} hasError={searchParams.error === "1"} />
      </div>
    </div>
  );
}
