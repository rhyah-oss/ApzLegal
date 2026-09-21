// ── APZ Legal — unified design tokens ─────────────────────────────────────────
// Single source of truth for the APZ palette used across all pages.
// CSS variables keep existing page styles synchronized with the active theme.

export const T = {
  bg:        "var(--apz-bg)",
  surface:   "var(--apz-surface)",
  surfaceB:  "var(--apz-surface-b)",
  surfaceEl: "var(--apz-surface-el)",
  border:    "var(--apz-border)",
  borderSub: "var(--apz-border-sub)",
  nav:       "var(--apz-nav)",
  navSurface:"var(--apz-nav-surface)",
  navBorder: "var(--apz-nav-border)",
  navText:   "var(--apz-nav-text)",
  navDim:    "var(--apz-nav-text-dim)",
  navFaint:  "var(--apz-nav-text-faint)",
  text:      "var(--apz-text)",
  textDim:   "var(--apz-text-dim)",
  textFaint: "var(--apz-text-faint)",
  ok:        "var(--apz-ok)",
  warn:      "var(--apz-warn)",
  risk:      "var(--apz-risk)",
  blue:      "var(--apz-blue)",
  cyan:      "var(--apz-cyan)",
} as const

/** Rounded card surface style object */
export const cardStyle = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
}

/** Pill badge style given a hex color */
export function pillStyle(color: string) {
  return {
    display: "inline-flex" as const, alignItems: "center" as const, gap: 5,
    padding: "2px 9px 2px 7px",
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
    borderRadius: 20,
    fontSize: 9, fontWeight: 700, color,
    textTransform: "uppercase" as const, letterSpacing: "0.07em",
  }
}
