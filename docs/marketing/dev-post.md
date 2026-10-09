---
title: "I built Repo X-Ray — an X-ray for your JS/TS dependency graph (100% in the browser)"
published: false
tags: typescript, react, vite, devtools, webdev
canonical_url: ""
cover_image: ""
---

# I built Repo X-Ray — an X-ray for your JS/TS dependency graph

Every time I join a new codebase (or come back to an old one), the same questions hit me: what depends on what, which files are load-bearing, where are the circular imports, and why did this one `require()` survive into 2026? I wanted a tool that answers all of that without a backend, without uploading a line of code.

So I built **Repo X-Ray**. You pick a local folder, it scans `.js/.jsx/.ts/.tsx`, and you get an interactive dependency graph with a click-for-details inspector, cycle detection, and JSON/Mermaid/DOT exports. Everything runs in the browser via the File System Access API — your repo never leaves the tab.

Live: https://repo-x-ray.vercel.app

## What it detects

- ES imports (`import … from`, including multi-line and `import type`)
- dynamic `import()` — including template-literal forms (flagged as unresolvable)
- `require()` calls and `import x = require('y')`
- `export … from` re-exports
- relative dependencies, resolved across `.ts/.tsx/.js/.jsx/.mjs/.cjs` and `index.*`
- **tsconfig/jsconfig `paths` and vite/webpack aliases** (`@/…`, `~/…`) resolved to real files
- circular dependencies (Tarjan SCC)
- unresolved relative imports, mixed ESM+`require()` files, barrel files, 10+ deep chains, orphan test files

## The fun architecture bits

**Regex first, AST when you ask.** The default scanner is a tuned regex pass — 511ms for a 7.8MB repo (~15MB/s). If you want it paranoid, flip the engine selector to `ts-ast`: it lazy-loads the TypeScript compiler *inside a Web Worker* and walks the real AST. It's ~12x slower (6121ms on that same repo) but catches things regex can't — like a string literal that merely looks like an import. The initial bundle never pays for TypeScript.

**A Web Worker owns the analysis.** The scan posts files to a worker, so the UI stays scrollable while a 9,600-file repo crunches. The Expensify `App` repo (9,641 files, 10,153 edges) finishes in ~4.8s and finds **36 cycles**, including a monster 24-file cycle through `open-sse/translator`. Rendering caps at 1,500 nodes ranked by degree — beyond that, force layouts die a slow death, so it tells you it's showing the top N instead of hanging.

**Cycles via Tarjan.** Strongly-connected components, not DFS-with-a-stack. Any SCC with more than one member is a cycle; self-loops count too. Each cycle gets a "Trace" button that isolates the strand in the graph, plus a suggested fix: convert the back-edge to `await import()` to defer evaluation.

**Scan snapshots + compare.** "Save scan" drops the analysis into IndexedDB. Pick an older scan as the "before" side, hit Compare, and you get files added/removed/changed, edges added/removed, cycles and problems before/after, and per-file problem deltas. "What did this PR do to our dependency graph" is now a button.

**Offline-only dependency audit.** Every `package.json` in the tree is parsed for floating ranges (`*`, `latest`), git/URL deps, empty specs, workspace protocol, and peer-without-prod. No network, no CVSS database — just the kinds of things that bite you at 2am during an install.

## Fix suggestions, not just red badges

The Fixes tab generates copy-ready snippets:

- unresolved `'./button'` → "you probably mean `./Button` (rename candidate found by Levenshtein)"
- cycle → "break it by lazy-loading the back-edge" with the actual diff
- mixed require + ESM → the ESM version of each `require()` call
- dependency audit issues → the exact `package.json` line

## Try it

```bash
bun run dev
# or just open https://repo-x-ray.vercel.app and pick a folder
```

Tests: 43 vitest cases covering parser parity, alias resolution, cycle detection, monorepo packaging, the diff engine, and every fix generator.

---

What should I add next — a rules engine (custom lint rules over the graph), real AST-driven metrics like nesting depth, or GitHub repo import? Tell me in the comments.
