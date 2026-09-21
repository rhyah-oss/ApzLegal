---
name: APZ Legal platform — design history
description: Records the design evolution of the APZ Legal platform (formerly Lexora AI) and the current canonical theme
---

# APZ Legal — Design History & Current Theme

## Brand
- Product name: **APZ Legal** (previously rebranded to "Lexora AI" but reverted back to APZ Legal by user request)
- Logo: PNG file `/public/apz-legal-logo.png` — "A" shape with embedded scales of justice, gradient cyan→royal blue→deep navy, black bg
- Artifact dir: `artifacts/apz-legal` (unchanged throughout)

## Current Design System
- **Modes:** Dark mode uses layered charcoal/slate surfaces with restrained brass emphasis; light mode uses semantic APZ CSS tokens rather than inversion so page-level styles stay coherent.
- **Dark body bg:** `#0B0D0E`
- **Dark sidebar bg:** `#1A1D1E`
- **Dark card/surface:** `#121516`
- **Dark elevated surface:** `#222728`
- **Dark border:** `#303536`
- **Dark text primary:** `#F1F0EB`
- **Dark text muted:** `#A7AAA6`
- **Dark text faint:** `#6F7571`
- **Dark primary accent:** `#4169E1`
- **Dark cyan accent:** `#00CFFF`
- **Light mode:** cool white surfaces, ink text, muted blue-grey accents, and the same charcoal navigation rail.

## CSS vars (`.dark` section in `index.css`)
- `--primary: 224 70% 57%` → `#4169E1`
- `--background: 210 10% 5%` → layered charcoal body
- `--sidebar: 200 9% 9%` → charcoal navigation
- `--card: 200 9% 8%` → `#121516`
- `--border: 200 8% 20%` → `#303536`
- chart colors: royal blue, cyan, medium blue, light cyan, deep blue

## 13 Modules wired in App.tsx
| Route | Module |
|-------|--------|
| `/` | Dashboard |
| `/matters` | Matters |
| `/calendar` | Calendar |
| `/tasks` | Tasks |
| `/ai` | Legal AI |
| `/research` | Research |
| `/documents` | Documents |
| `/templates` | Templates |
| `/email` | Email Discovery |
| `/workflow` | Workflows |
| `/time` | Time & Billing |
| `/audit` | Audit Logs |
| `/admin` | Admin |

## Sidebar NAV groups
- WORKSPACE: Dashboard, Matters, Calendar, Tasks
- AI & RESEARCH: Legal AI, Research
- CONTENT: Documents, Templates, Email
- OPERATIONS: Workflows, Time & Billing
- COMPLIANCE: Audit Logs, Admin

## Logo usage
- Sidebar: `<img src="/apz-legal-logo.png" className="h-7 w-7 object-contain rounded" />`
- Login left panel: `h-10 w-10`
- Login mobile: `h-9 w-9`
- The PNG has a black background — renders fine on the dark navy sidebar

## Key PRD principles
- Citation-first AI: "Source not found" when no verifiable source
- Human approval required for all outbound emails (amber warning banner)
- Phase 1 footer: "South African Law · Phase 1"

## recharts
- Must have `optimizeDeps.include: ['recharts']` in `vite.config.ts` (React instance mismatch on cold start)

**Why:** The workspace reference moved the product from an all-navy treatment to a calmer charcoal/slate legal workspace; APZ blue/cyan remain brand accents while brass is reserved for emphasis and focus states.
