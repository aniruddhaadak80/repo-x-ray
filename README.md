# Repo X-Ray

Browser-only developer tool that scans a local JavaScript/TypeScript repository and renders an interactive dependency graph. **No backend — everything runs locally in your browser.**

🔗 Live: https://repo-x-ray.vercel.app · https://aniruddhaadak80.github.io/repo-x-ray/

## What it does

Pick a repo (native File System Access folder picker in Chrome/Edge, `<input webkitdirectory>` compat mode elsewhere, or drag & drop a folder) and it:

- Analyzes `.js`, `.jsx`, `.ts`, `.tsx` (skips `node_modules`, `dist`, `build`, `out`, `coverage`, `next`, `.git`, …)
- Detects ES imports, `export … from`, dynamic `import()`, `require()`, `import type`, package `#imports`
- Resolves relative paths (`.ts/.tsx/.js/.jsx/.mjs/.cjs`, `index.*`) **and tsconfig/jsconfig `paths` + vite/webpack aliases** (`@/…`, `~/…`)
- Flags unresolved relative imports, circular dependencies (Tarjan SCC), mixed ESM+`require()` files
- Computes coupling metrics: fan-in/fan-out, instability, entry points, orphans, directory coupling, deepest chains
- Detects workspace packages (pnpm/npm workspaces, lerna, nested `package.json`) with package-level dependency edges

### The graph

Force-directed canvas graph (`react-force-graph-2d`, analyzed in a Web Worker so the UI never blocks) with:

- 6 layouts: force / tree ↓ ↑ → ← / radial
- Color modes: extension, cycles, problems, fan-in, instability (heat)
- Edge styling per kind (ESM / dynamic-dashed / require-dotted / types), edge-kind filters
- Ego focus (1°/2°), cycle tracing, label toggle, drag/pan/zoom, `Reset view`

### Details panel

Click a node for path, extension, LOC, fan-in/out, stability meter, imports (kind + line + resolved target, click to jump), imported-by list, entry/cycle badges, detected problems.

### Search & filters

Path search (`/` shortcut), extension toggles, edge-kind toggles, "problems only" mode, cycles tab with per-cycle tracing, metrics tab, and a **⌘K command palette** (fuzzy file jump + commands). `Esc` clears the selection. State is deep-linkable (`#file=…&q=…`).

### Snapshots & compare

Save scans to IndexedDB (Save scan), then pick any saved scan as the "before" side and hit Compare to diff files/edges/cycles/problems against the current repo.

### Export

JSON report, Graphviz DOT, Mermaid flowchart, or a Markdown summary — copy to clipboard or download.

### PWA

Installable (manifest + icons + offline shell via service worker) — once loaded it works with no network.

## Run

```bash
bun install
bun dev          # http://localhost:5173
bun run build    # production build
bun test         # 30 unit tests
bun run scripts/smoke.ts <repoPath>   # analyzer smoke test on a real repo
```

Stress-tested on real repos: the 9,641-file Expensify `App` repo → 36 cycles found in ~4.8s (in a Web Worker).

## Layout

```
src/lib/parser.ts       import detection (ESM / dynamic / require / type / re-exports)
src/lib/analyze.ts      graph building, alias + package resolution, cycles, metrics
src/lib/fs.ts           folder picking + walking (File System Access API)
src/lib/fsAccessDrop.ts drag & drop support
src/lib/export.ts       JSON / DOT / Mermaid / Markdown builders
src/components/         GraphView (controls: layout/color/edges/focus), Sidebar (tabs), DetailsPanel, ReportDialog
src/App.tsx             landing, workbench, URL state, shortcuts, report modal
```

## JSON report shape

```jsonc
{
  "root": "my-repo",
  "stats": { "files": 42, "edges": 130, "cycles": 2, "unresolved": 7, "aliasedEdges": 12, "byExt": { /* … */ }, "byKind": { "esm": 100, "dynamic": 3, "require": 4, "type": 2 }, "loc": 9000 },
  "aliases": [{ "pattern": "@", "target": "src" }],
  "cycles": [["src/a.ts", "src/b.ts"]],
  "metrics": { "fanInTop": [/* … */], "deepestChains": [/* … */], "directoryCoupling": [/* … */] },
  "files": [{ "path": "…", "ext": "ts", "loc": 120, "fanIn": 3, "fanOut": 1, "instability": 0.25, "imports": [/* ImportRef */], "importedBy": [/* … */], "problems": [/* … */] }],
  "edges": [{ "source": "…", "target": "…", "kind": "esm", "inCycle": false }]
}
```
