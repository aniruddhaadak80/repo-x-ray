I shipped a developer tool this week that answers a question I ask in every new codebase: what actually depends on what?

Repo X-Ray — you pick a local JavaScript or TypeScript repository folder, and it renders the full dependency graph in the browser. No backend, no uploads. Your code never leaves the tab.

What it does:
→ Scans .js/.jsx/.ts/.tsx for ES imports, dynamic import(), require(), re-exports, type-only imports
→ Resolves tsconfig/vite aliases (@/…) to real files — the thing every homegrown grep-based script gets wrong
→ Tarjan SCC cycle detection. On the 9,641-file Expensify App repo it found 36 circular dependencies, including a 24-file cycle through the translation layer that no human would catch by hand
→ Click any file for fan-in/fan-out, instability, imports, imported-by, and detected problems with copy-ready fix snippets
→ Save a scan, come back next week, Compare: exactly what your PR did to the dependency graph
→ Export JSON, Graphviz DOT, Mermaid, or Markdown

The engineering detail I'm happiest about: two scanning engines behind one interface. A tuned regex pass (~15MB/s) for the default, and an optional real TypeScript-AST walk that lazy-loads the compiler inside a Web Worker, ~12x slower but catches string literals that merely look like imports. The initial bundle never pays for TypeScript, and the UI never blocks while a 10k-file repo scans.

43 tests. Dark UI I'd actually use daily.

Try it (repo never leaves your browser): https://repo-x-ray.vercel.app
Source: github.com/aniruddhaadak80/repo-x-ray

Next: a rules engine for custom graph lint rules. What would you add?
