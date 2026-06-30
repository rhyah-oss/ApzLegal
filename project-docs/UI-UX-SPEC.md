# UI/UX Specification — Lexora AI

**Design reference:** Cursor IDE, Linear, ChatGPT (desktop), modern legal-tech  
**Primary mode (Phase 1):** Monochrome light mode  
**Secondary mode:** Dark mode (scaffold in Phase 1, polish later)

---

## 1. Design Principles

1. **Desktop application, not a website** — fixed chrome, dense layout, no marketing hero sections
2. **Cursor fidelity** — pill shapes, thin bars, compressed text, 1px borders
3. **Totally resizable** — every major pane resizes; layout persists
4. **Monochrome first** — light mode uses only grey, black, and white (no colour accents in Phase 1)
5. **Information density** — maximise content per pixel without clutter
6. **Professional restraint** — no neon, no gradients, no cartoon icons, minimal animation

---

## 2. Cursor-Inspired Visual Language

### 2.1 Shape Language

| Element | Style |
|---------|-------|
| Tabs | Pill-shaped (`border-radius: 9999px` or `6px` full pill for active tab groups) |
| Buttons (secondary) | Pill outline, 1px border, transparent fill |
| Buttons (primary) | Pill fill, solid black or dark grey |
| Chips / tags | Small pills, 1px border, uppercase optional |
| Inputs | Rounded rectangle (`4px`), 1px border, no shadow |
| Search bar | Pill-shaped, inset in header |
| Status indicators | Small dot or pill badge |
| Panel containers | Sharp or `4px` radius, **1px solid border**, no drop shadow (or `shadow-sm` only on popovers) |

### 2.2 Border System

```css
/* Canonical border tokens — light mode */
--border-default: 1px solid #e5e5e5;   /* panel edges, dividers */
--border-subtle:  1px solid #f0f0f0;   /* inner splits */
--border-strong:  1px solid #d4d4d4;   /* focused panes, active tabs */
--border-focus:   1px solid #a3a3a3;   /* keyboard focus ring substitute */
```

All panes separated by **1px borders**, not gaps or shadows.

### 2.3 Header and Footer

| Bar | Height | Contents |
|-----|--------|----------|
| **Header** | `28px`–`32px` fixed | Logo mark (16px), breadcrumb (11px), centred pill search, right: command hint, notifications, avatar |
| **Footer** | `22px`–`24px` fixed | Left: connection/sync status; centre: active matter chip (pill); right: line/col indicator, encoding, AI status dot |

Headers and footers must **never grow** with content. Overflow truncates with ellipsis.

---

## 3. Typography (Cursor-Aligned)

Cursor uses system UI stacks with very small base sizes. Match these targets:

### 3.1 Font Stack

```css
--font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
             "Inter", "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono",
             "Liberation Mono", Menlo, monospace;
```

Prefer **Inter** if loaded; fall back to system UI.

### 3.2 Type Scale (Compressed)

| Token | Size | Line height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-2xs` | 10px | 14px | 400 | Footer status, timestamps |
| `text-xs` | 11px | 16px | 400 | Sidebar labels, table cells, metadata |
| `text-sm` | 12px | 18px | 400 | Body default, form labels |
| `text-base` | 13px | 20px | 400 | Primary content, chat messages |
| `text-md` | 14px | 20px | 500 | Section headings within panes |
| `text-lg` | 15px | 22px | 600 | Page titles (rare — keep small) |

**Default body size: 12px–13px.** This is intentionally tighter than typical web apps.

### 3.3 Letter Spacing

- UI labels: `0.01em`
- Uppercase micro-labels (optional): `0.04em`, 10px
- Body: `0` (normal)

---

## 4. Colour — Monochrome Light Mode (Phase 1 Primary)

No accent colours in Phase 1. Use grey scale only.

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-app` | `#fafafa` | Application background |
| `--bg-panel` | `#ffffff` | Panel surfaces |
| `--bg-sidebar` | `#f5f5f5` | Sidebar background |
| `--bg-hover` | `#f0f0f0` | Row hover, menu hover |
| `--bg-active` | `#e5e5e5` | Selected nav item, active tab fill |
| `--bg-input` | `#ffffff` | Input backgrounds |
| `--text-primary` | `#171717` | Primary text (near black) |
| `--text-secondary` | `#525252` | Secondary labels |
| `--text-muted` | `#a3a3a3` | Placeholder, disabled |
| `--border` | `#e5e5e5` | Default borders |
| `--border-strong` | `#d4d4d4` | Emphasised borders |
| `--text-inverse` | `#fafafa` | Text on dark pills |

### 4.1 Dark Mode Tokens (Scaffold)

| Token | Hex |
|-------|-----|
| `--bg-app` | `#1e1e1e` |
| `--bg-panel` | `#252526` |
| `--bg-sidebar` | `#333333` |
| `--text-primary` | `#cccccc` |
| `--border` | `#3c3c3c` |

Toggle via class `dark` on `<html>`. Phase 1: light mode is default and fully polished.

---

## 5. Spacing (Tight)

| Token | Value | Usage |
|-------|-------|-------|
| `space-0.5` | 2px | Icon gaps |
| `space-1` | 4px | Inline padding |
| `space-1.5` | 6px | Pill button padding vertical |
| `space-2` | 8px | List item padding |
| `space-2.5` | 10px | Sidebar item height contribution |
| `space-3` | 12px | Panel inner padding |
| `space-4` | 16px | Section gaps (max for dense areas) |

**Sidebar item height:** 28px  
**Table row height:** 28px–32px  
**Tab height:** 26px  

---

## 6. Layout and Resizability

### 6.1 Shell Grid

```
height: 100vh; overflow: hidden;
grid-template-rows: var(--header-h) 1fr var(--footer-h);
```

No page scroll on shell — only pane interiors scroll.

### 6.2 Resizable Panes

Use **react-resizable-panels** (or equivalent):

| Split | Default | Min | Max | Persist key |
|-------|---------|-----|-----|-------------|
| Sidebar ↔ Main | 220px / flex | 48px (icon) | 320px | `layout.sidebar` |
| Main ↔ Context | flex / 320px | 200px | 480px | `layout.context` |
| Matter: Nav ↔ Content | 240px / flex | 180px | 400px | `layout.matter.nav` |
| Matter: Content ↔ AI | flex / 360px | 280px | 560px | `layout.matter.ai` |
| Document: Editor ↔ Preview | 50% / 50% | 30% | 70% | `layout.doc.split` |

- Drag handles: 1px border zone, 4px hit area, `col-resize` cursor
- Double-click handle: reset to default
- Save layout to `localStorage` on drag end (Phase 2: user preferences table)

### 6.3 Tabs

- Pill tab bar below header or within pane top
- Active tab: filled pill (`--bg-active` or black fill + white text for primary view)
- Inactive: text only or outline pill
- Overflow: horizontal scroll, no wrapping
- Middle-click close (where applicable)

---

## 7. Component Specifications

### 7.1 Sidebar Navigation

```
┌─────────────────┐
│ [icon] Dashboard│  ← 28px row, 11px label
│ [icon] Matters  │
│ ...             │
├─────────────────┤  ← 1px border
│ [icon] Admin    │
└─────────────────┘
```

- Collapsed width: 48px (icons only, tooltip on hover)
- Active item: `--bg-active` pill inset or full-row highlight
- Section dividers: 1px `--border`

### 7.2 Command Palette

- Trigger: `Cmd+K` / `Ctrl+K`
- Modal: centred, max-width 560px, pill search input
- Results: 28px rows, fuzzy match highlighted
- Phase 1: navigation + mock actions only

### 7.3 Data Tables (TanStack Table)

- Virtualised rows for long lists
- 11px header text, uppercase optional
- 12px cell text
- 1px row borders (horizontal only)
- No zebra striping — hover only
- Column resize optional (Phase 2)

### 7.4 Legal AI Chat Panel

```
┌──────────────────────────────┐
│ Matter: ABC v XYZ      [···] │  ← 11px context bar
├──────────────────────────────┤
│ User message            12px │
│ AI response             12px │
│ [Verified] [2 citations]     │  ← pill chips
├──────────────────────────────┤
│ CITATIONS                    │  ← 10px uppercase label
│ ┌─ Case Name ─────────────┐  │
│ │ ¶12 · 87% · Verified   │  │  ← citation card, 1px border
│ └─────────────────────────┘  │
├──────────────────────────────┤
│ [ Ask about this matter... ] │  ← pill input
└──────────────────────────────┘
```

### 7.5 Citation Card

| Row | Style |
|-----|-------|
| Title | 12px, weight 500 |
| Meta | 10px, `--text-muted` |
| Excerpt | 11px mono or sans, left border 2px |
| Actions | Pill buttons: Open, Approve, Reject |

### 7.6 Status Pills

| Status | Light mode |
|--------|------------|
| Verified | Black fill, white text |
| Unverified | White fill, 1px black border |
| Not found | Grey fill `#e5e5e5`, dark text |
| Pending | Outline pill, dashed border optional |

---

## 8. Icons

- Library: **Lucide React** (stroke icons, 14px–16px default)
- Stroke width: 1.5
- Colour: inherit text colour — no coloured icons in Phase 1

---

## 9. Motion

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Sidebar collapse | 150ms | ease-out |
| Panel resize | 0ms (instant follow drag) | — |
| Popover open | 100ms | ease-out |
| Page transition | None (instant swap) | — |

Avoid decorative animation. No bounce, no slide-in page transitions.

---

## 10. Keyboard Shortcuts (Phase 1)

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Command palette |
| `Cmd/Ctrl+B` | Toggle sidebar |
| `Cmd/Ctrl+\` | Toggle context panel |
| `Cmd/Ctrl+1…9` | Jump to nav module |
| `Esc` | Close modal / palette |

---

## 11. Tailwind Configuration Notes

```js
// tailwind.config — key extensions
{
  fontSize: {
    '2xs': ['10px', { lineHeight: '14px' }],
    'xs':  ['11px', { lineHeight: '16px' }],
    'sm':  ['12px', { lineHeight: '18px' }],
    'base':['13px', { lineHeight: '20px' }],
  },
  spacing: {
    'header': '28px',
    'footer': '22px',
    'sidebar': '220px',
    'sidebar-collapsed': '48px',
  },
  borderRadius: {
    'pill': '9999px',
    'panel': '4px',
  },
}
```

---

## 12. shadcn/ui Customisation

Override shadcn defaults for density:

- Button `size="sm"`: height 26px, text 11px, pill radius
- Input height: 28px
- Select, Dropdown: match input height
- Dialog: sharp corners or 4px, 1px border, no heavy shadow
- ScrollArea: thin scrollbar (6px), `#d4d4d4` thumb

---

## 13. Screen Inventory (Phase 1)

| Screen | Route | Key components |
|--------|-------|----------------|
| Login | `/login` | Centred card, pill inputs, minimal |
| Dashboard | `/` | Stat pills, approval queue table |
| Matters list | `/matters` | Filter bar, virtualised table |
| Matter workspace | `/matters/[id]` | 3-pane resizable layout |
| Legal AI | `/ai` | Chat + citation panel |
| Research | `/research` | Search pill + results list |
| Documents | `/documents` | Folder tree + preview |
| Email discovery | `/email` | Thread list + reading pane |
| Workflows | `/workflows` | Approval queue |
| Time & billing | `/billing` | Timer + entries table |
| Calendar | `/calendar` | Month grid (compact) |
| Tasks | `/tasks` | Checklist table |
| Templates | `/templates` | Template cards |
| Admin | `/admin/*` | Settings forms |
| Audit logs | `/audit` | Immutable log table |

All screens use the **same shell** — only main + context panes swap content.

---

## 14. Mock Data Guidelines

- 5–8 matters with realistic SA legal names
- 3–5 citations per mock AI response (mix verified / unverified / not found)
- 10+ documents per flagship matter
- Email threads with attachment indicators
- Workflow items in varied statuses
- Time entries linked to matters and tasks

Use `/src/data/mock/` JSON or TypeScript fixtures.

---

## 15. Accessibility Minimums

- Focus visible: 1px `--border-focus` outline on keyboard focus
- All interactive elements reachable by Tab
- `aria-label` on icon-only buttons
- Colour not sole indicator — use text labels on verification status
- Minimum contrast: WCAG AA for `--text-primary` on `--bg-panel`
