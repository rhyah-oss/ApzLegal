---
name: APZ Legal dark theme setup
description: Full-app dark mode implementation details and recharts Vite fix.
---

## Dark mode approach
- `index.html` has `class="dark"` on `<html>` — this activates the `.dark {}` CSS variable block in `index.css`.
- Background colors: `bg-[#070E1A]` (main body), `bg-[#0A1628]` (sidebar), `bg-card` for panel/table surfaces.
- Cards use `border-white/[0.07] bg-white/[0.03]` for the glassmorphism look.
- The CSS variables already defined full dark overrides (`--background`, `--card`, `--foreground`, etc.) — no extra Tailwind config needed.

## recharts + Vite
Adding recharts as a new dependency triggers Vite's dep-optimization cycle mid-page, causing a React instance mismatch error ("Cannot read properties of null (reading 'useRef')"). Fix: add to `vite.config.ts`:
```ts
optimizeDeps: {
  include: ['recharts'],
},
```
`resolve.dedupe: ['react', 'react-dom']` was already present and is also required.

## Layout
- Fixed sidebar: `w-64`, `bg-[#0A1628]`, active nav items get a left-border `bg-gradient-to-b from-[#00D4FF] to-[#6366F1]` accent stripe.
- Top header: `h-14 sticky`, breadcrumb + date + notification bell + avatar.
- Page content: `pl-64` on the main container to offset the fixed sidebar.

## Dashboard charts
- Pipeline: `recharts BarChart` with per-bar `Cell` colors.
- FICA: `recharts PieChart` donut, wrap `ResponsiveContainer` in a fixed-size div to suppress the width/height warning.
- Revenue trend: `recharts AreaChart` with gradient fill.
- Workload: custom horizontal progress bars, color-coded by load (cyan → amber → red).
