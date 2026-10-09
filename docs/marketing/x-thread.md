🧵 I got tired of asking "what depends on what?" in new codebases.

So I built Repo X-Ray — pick a local JS/TS folder, get an interactive dependency graph. 100% browser, zero backend.

Here's what's inside ↓

1/ The scanner finds what "grep for import" misses:
• multi-line ES imports + `import type`
• dynamic `import()` (even `import(`./i18n/${lang}`)` → flagged)
• `require()` and `import x = require()`
• `export … from` re-exports
• tsconfig/vite aliases (`@/…`) resolved to real files

2/ Circular deps via Tarjan SCC. Pointed it at the Expensify App repo (9,641 files):
→ 36 cycles
→ one 24-file cycle through open-sse/translator that nobody would find by hand
→ "Trace" isolates the strand, "break cycle" gives you the `await import()` diff

3/ Two engines:
• regex — 511ms for 7.8MB (~15MB/s)
• TypeScript-AST — lazy-loads the compiler in a Web Worker, ~12x slower, catches string-literal decoys
Initial bundle never pays for TypeScript either way.

4/ Save a scan → come back next week → Compare. See exactly what your PR did to the dependency graph: files added/removed, edges, cycles, problems.

5/ Exports: JSON, Graphviz DOT, Mermaid, Markdown. ⌘K palette. Drag & drop a folder. PWA so it works offline.

bun run dev → http://localhost:5173
or just: https://repo-x-ray.vercel.app

Everything stays local — File System Access API, no uploads.

Code: github.com/aniruddhaadak80/repo-x-ray
