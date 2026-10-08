# Repo X-Ray — Design Spec

Browser-only developer tool that scans a local JS/TS repo and renders an interactive dependency graph.

## Scope
- Pick a local folder (File System Access API, `<input webkitdirectory>` fallback).
- Analyze `.js`, `.jsx`, `.ts`, `.tsx`. Skip `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`.
- Detect ES imports (`import`, `export … from`), dynamic `import()`, `require()`.
- Resolve relative specifiers to real files; flag unresolved ones.
- Detect circular dependencies (SCC size > 1 or self-loop).
- Interactive force graph (drag, pan, zoom, hover, click). Clicking a file shows path, LOC, imports, imported-by, problems.
- Search by path/name, extension filters, "problems only" filter.
- Export full JSON report.

## Stack
Vite + React + TypeScript strict + react-force-graph-2d. No backend.

## Modules
- `src/lib/types.ts` — shared types
- `src/lib/parser.ts` — import/require/dynamic detection
- `src/lib/analyze.ts` — build files/edges, resolution, cycles, problems
- `src/lib/fs.ts` — folder picking + walking
- `src/components/GraphView.tsx` — canvas graph
- `src/components/Sidebar.tsx` — stats, search, filters, file list
- `src/components/DetailsPanel.tsx` — selected file details
- `src/App.tsx` — layout + state

## Problems detected
- Participates in circular dependency
- Unresolved relative import
- Mixed ESM + require() in one file
