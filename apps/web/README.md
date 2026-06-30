# Lexora AI — Web Application (Phase 1)

Cursor-style desktop UI shell for the South African Legal AI platform.

## Run locally

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — login at [/login](http://localhost:3000/login).

## Phase 1 scope

- Application shell (thin header/footer, pill controls, 1px borders)
- Monochrome light mode + dark mode scaffold
- Resizable panes with localStorage persistence
- Command palette (⌘K)
- All 13 navigation modules with SA legal mock data
- Matter workspace (3-pane resizable layout)

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘/Ctrl+K | Command palette |
| ⌘/Ctrl+B | Toggle sidebar |
| ⌘/Ctrl+\\ | Toggle context panel |
| ⌘/Ctrl+1–9 | Jump to nav modules |

## Project docs

See [/project-docs](../project-docs/) for PRD, architecture, and roadmap.
