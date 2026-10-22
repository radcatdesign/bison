// The Bison Ops mark. Colors follow the theme, with one point of the tenant's accent.
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <rect width="64" height="64" rx="16" fill="var(--bo-ink)" />
      <path d="M21 17h14.5a8 8 0 0 1 3.7 15.1A8.5 8.5 0 0 1 36 48H21z" fill="none" stroke="var(--bo-canvas)" strokeWidth="5.5" strokeLinejoin="round" />
      <path d="M21 32h14" stroke="var(--bo-canvas)" strokeWidth="5.5" />
      <circle cx="48" cy="16" r="5" fill="var(--bo-accent)" />
    </svg>
  );
}
