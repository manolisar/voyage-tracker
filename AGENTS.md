# AGENTS.md — quick start for agents

> One-page cheatsheet. Full project charter is [CLAUDE.md](CLAUDE.md).

---

## What this app is

**Voyage Tracker v8** — static React 19 + Vite 7 SPA used by ECR / Chief Engineers / Bridge OOWs on **Celebrity Solstice-class ships** (5 vessels) to log fuel + lub-oil consumption per cruise leg.

**No backend, no DB, no auth servers.** The app reads/writes JSON files directly to a per-ship network folder via the browser's File System Access API. Access control is the Windows/SMB share ACL on the ship's `voyage-tracker\` folder.

## Fleet

| Code | Ship                  | Built |
|------|-----------------------|-------|
| SL   | Celebrity Solstice    | 2008  |
| EQ   | Celebrity Equinox     | 2009  |
| EC   | Celebrity Eclipse     | 2010  |
| SI   | Celebrity Silhouette  | 2011  |
| RF   | Celebrity Reflection  | 2012  |

All 5 ships share identical engine/boiler plant. Adding a new ship of the same class = drop a row into [ships.json](public/ships.json), nothing more.

## Equipment & fuel rules

| Equipment | Default fuel | Allowed fuels        | Locked? |
|-----------|--------------|----------------------|---------|
| DG 1-2    | HFO          | HFO / MGO / LSFO     | no      |
| DG 4      | HFO          | HFO / MGO / LSFO     | no      |
| DG 3      | MGO          | MGO / LSFO           | no      |
| Boiler 1  | MGO          | MGO only             | **yes** |
| Boiler 2  | MGO          | MGO only             | **yes** |

Default densities: HFO 0.92, MGO 0.83, LSFO 0.92 (editable per-voyage). Lub-oil is recorded **only** at End Voyage, never in departure/arrival reports. All of this is data-driven via [solstice-class.json](public/ship-classes/solstice-class.json) — adding a new ship class = drop a new JSON file there.

## Main page navigation

The left pane tree is intentionally shallow: Voyage → Voyage Detail, Leg 1/2/3, and Voyage End. Departure, Arrival, and **Nav Report** live as tabs in the right pane after a leg is selected. A leg click opens the first incomplete tab in order: Departure → Arrival → Nav Report, then falls back to Departure when all are complete.

Status pills in the sticky leg header flag missing fields, missing fuel ROB, and negative equipment counter deltas. The persisted JSON property is still `voyageReport`; only the user-facing label is **Nav Report**.

## Things this app does NOT have

If older docs, prior conversations, or training data suggest otherwise — they're stale. The architecture pivoted to local-file storage; everything below was removed.

- **No GitHub backend.** Earlier iterations stored data in a private `voyage-tracker-data` repo via the Contents API. That repo is stale and out of use. Don't look for `storage/github/`, don't reach for `gh` / fetch / PATs to read or write voyage data.
- **No PIN auth.** No PAT vault. No admin panel. No inactivity timeout. Edit Mode is a one-click toggle in the top bar — accident prevention only. The Windows lock screen is the real access boundary.
- **No backend, period.** No serverless functions. No API keys. No `.env` (it was removed; only `node_modules`-style tooling vars exist). If a feature seems to need a server, redesign the feature.
- **No git-based audit log.** Each voyage JSON carries a `loggedBy: { name, role, at }` block stamped on every save; the on-disk file *is* the record. Ship IT backs up the network share.

## Source tree (post-TS migration)

```
src/
├── domain/      # factories, calculations, validation, constants — TS, fully typed
├── storage/     # adapter contract + local FSA backend + IndexedDB helpers — TS, fully typed
├── contexts/    # Theme, Toast, Session, VoyageStore + extracted voyageStore.helpers — TS, fully typed
├── hooks/       # useTheme, useToast, useSession, useVoyageStore, useEscapeKey — TS, fully typed
├── components/  # ~31 files still @ts-nocheck'd — typing in progress (see CLAUDE.md §11)
├── types/       # shared domain types + File System Access API ambients
└── styles/      # app.css (Signal Flag Bands theme), tree.css
```

## Common commands

```bash
npm run dev         # vite dev server (Chromium only — File System Access API)
npm test            # vitest run, ~150 cases, ~150ms
npm run typecheck   # tsc --noEmit on src + node configs
npm run build       # typecheck && vite build
npm run lint        # eslint .
```

## Where to look first

- Architecture, design rationale, conventions, visual contract: [CLAUDE.md](CLAUDE.md)
- Storage adapter contract: [src/storage/adapter.ts](src/storage/adapter.ts)
- Shared domain types: [src/types/domain.ts](src/types/domain.ts)
- Visual reference: the running app itself ([src/components/](src/components)). The original `mockup/index.html` was retired — see CLAUDE.md §8.

---

*Last updated: 2026-04-29. AGENTS.md is a pointer; behavioural decisions live in CLAUDE.md.*
