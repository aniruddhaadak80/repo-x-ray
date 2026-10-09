# Repo X-Ray

Browser-only developer tool that scans a local JavaScript/TypeScript repository and renders an interactive dependency graph. **No backend — everything runs locally in your browser.**

🔗 Live: https://repo-x-ray.vercel.app · https://aniruddhaadak80.github.io/repo-x-ray/ · https://github.com/aniruddhaadak80/repo-x-ray

## What it does

Pick a repo (native File System Access folder picker in Chrome/Edge, `<input webkitdirectory>` compat mode elsewhere, or drag & drop a folder) and it:

- Analyzes `.js`, `.jsx`, `.ts`, `.tsx` (skips `node_modules`, `dist`, `build`, `out`, `coverage`, `next`, `.git`, …)
- Detects ES imports, `export … from`, dynamic `import()`, `require()`, `import type`, package `#imports`
- Resolves relative paths (`.ts/.tsx/.js/.jsx/.mjs/.cjs`, `index.*`) **and tsconfig/jsconfig `paths` + vite/webpack aliases** (`@/…`, `~/…`)
- Flags unresolved relative imports, circular dependencies (Tarjan SCC), mixed ESM+`require()` files
- Computes coupling metrics: fan-in/fan-out, instability, entry points, orphans, directory coupling, deepest chains
- Detects workspace packages (pnpm/npm workspaces, lerna, nested `package.json`) with package-level dependency edges
- Audits declared dependencies offline: floating ranges (`*`, `latest`), git/URL deps, empty specs, workspace protocol, peer-without-prod

### Two scanning engines

| Engine | Speed (7.8MB repo) | Catches |
|---|---|---|
| `regex` (default) | ~511ms (15 MB/s) | everything a line scanner can |
| `ts-ast` (opt-in) | ~6.1s | string literals that look like imports, all multi-line forms, real AST guarantees |

The TypeScript compiler is lazy-loaded **inside the scan Web Worker** — the initial bundle never pays for it, and the UI never freezes while a huge repo analyzes. Stress-tested on the 9,641-file Expensify `App` repo: 36 cycles found, ~4.8s.

### The graph

Force-directed canvas graph (`react-force-graph-2d`) with 6 layouts (force / tree ↓↑→← / radial), 5 color modes (extension, cycles, problems, fan-in, instability), edge-kind filters with per-kind styling (dynamic = dashed, require = dotted, types = hollow), ego focus (1°/2°), cycle tracing, label toggle, drag/pan/zoom.

### Details panel

Click a node for path, extension, LOC, fan-in/out, stability meter, imports (kind + line + resolved target, click to jump), imported-by list, entry/cycle badges, detected problems.

### Fix suggestions

The Fixes tab generates copy-ready snippets: moved-file candidates (Levenshtein) for unresolved imports, cycle break points (`await import()`), ESM unification for mixed files, plus the full dependency audit.

### Search & filters

Path search (`/` shortcut), extension toggles, edge-kind toggles, "problems only", cycles tab with per-cycle tracing, metrics tab, and a **⌘K command palette** (fuzzy file jump + commands). State is deep-linkable (`#file=…&q=…`).

### Snapshots & compare

Save scans to IndexedDB, pick any saved scan as the "before" side, hit Compare for files added/removed/changed, edges, cycles and problems before/after.

### Export

JSON report, Graphviz DOT, Mermaid flowchart, or a Markdown summary — copy to clipboard or download.

### PWA

Installable (manifest + icons + offline service-worker shell) — once loaded it works with no network.

## Run

```bash
bun install
bun dev          # http://localhost:5173
bun run build    # production build
bun test         # 43 unit tests
bun run scripts/smoke.ts <repoPath>   # analyzer smoke test
bun run scripts/bench.ts <repoPath>   # regex vs AST benchmark
```

## Layout

```
src/lib/parser.ts       regex scanner (ESM / dynamic / require / type / re-exports)
src/lib/astParse.ts     TypeScript-AST scanner (lazy, worker-side)
src/lib/analyze.ts      graph building, alias + package resolution, cycles, metrics, dep audit, monorepo
src/lib/fs.ts           folder picking + walking (File System Access API)
src/lib/fsAccessDrop.ts drag & drop support
src/lib/export.ts       JSON / DOT / Mermaid / Markdown builders
src/lib/fixes.ts        fix suggestions
src/lib/diff.ts         scan comparison
src/lib/snapshots.ts    IndexedDB scan storage
src/lib/runAnalysis.ts  worker bridge with regex fallback
src/components/         GraphView, GraphControls, Sidebar, DetailsPanel, ReportDialog, CompareDialog, SnapshotsPanel, FixesPanel, CommandPalette
src/App.tsx             landing, workbench, URL state, shortcuts
```

Marketing drafts live in `docs/marketing/` (DEV post, X thread, LinkedIn).
