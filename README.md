# Repo X-Ray

Browser-based tool that scans a local JavaScript/TypeScript repository and
renders an interactive dependency graph. **No backend — everything runs
locally in your browser.**

https://github.com/aniruddhaadak

## What it does

- Select a local repo folder (native File System Access folder picker in
  Chrome/Edge, `<input webkitdirectory>` fallback elsewhere).
- Analyzes `.js`, `.jsx`, `.ts`, `.tsx` files (skips `node_modules`, `dist`,
  `build`, `out`, `coverage`, `.next`, `.git`, …).
- Detects:
  - ES imports (`import x from '…'`, `export … from '…'`)
  - dynamic imports (`import('…')`)
  - `require('…')` calls
  - relative dependencies (resolved across `.ts/.tsx/.js/.jsx` and `index.*`)
  - circular dependencies (via Tarjan SCC)
- Interactive force-directed graph — drag, pan, zoom, hover, click.
- Clicking a file shows: path, LOC, imports (with kind), imported-by list,
  detected problems.
- Search, extension filters, "problems only" filter.
- One-click JSON report export.

## Run

```bash
bun install
bun dev      # http://localhost:5173
bun build    # production build
bun test     # unit tests for parser/analyzer
```

## Layout

```
src/lib/parser.ts    import detection (ESM / dynamic / require)
src/lib/analyze.ts   graph building, path resolution, cycles, problems
src/lib/fs.ts        folder picking + walking (File System Access API)
src/components/      GraphView / Sidebar / DetailsPanel
src/App.tsx          landing screen, workbench, JSON export
```

## JSON report shape

```jsonc
{
  "root": "my-repo",
  "stats": { "files": 42, "edges": 130, "cycles": 2, "unresolved": 7, "byExt": { /* … */ } },
  "cycles": [["src/a.ts", "src/b.ts"]],
  "files": [{ "path": "…", "ext": "ts", "loc": 120, "imports": [/* ImportRef */],
              "importedBy": [/* … */], "problems": [/* … */] }],
  "edges": [{ "source": "…", "target": "…", "kind": "esm", "inCycle": false }]
}
```
