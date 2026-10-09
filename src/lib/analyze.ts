import type { Analysis, ConfigFile, DepKind, Ext, FileInfo, GraphEdge, Metrics, RawFile } from './types'
import { parseImports } from './parser'

const RESOLVE_EXTS = ['tsx', 'ts', 'jsx', 'js', 'mts', 'cts', 'mjs', 'cjs']
const ASSET_RE = /\.(css|scss|sass|less|json|svg|png|jpe?g|gif|webp|md|wasm|txt|ya?ml|toml|html|vue|svelte|astro|graphql)$/i

interface Alias {
  /** pattern without trailing '/*', e.g. "@" or "@/components" */
  pattern: string
  /** target path (repo-relative) without trailing '/*', e.g. "src" */
  target: string
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

export function normalize(p: string): string {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

function resolveDirect(base: string, files: Set<string>): string | null {
  const candidates = [base, ...RESOLVE_EXTS.flatMap((ext) => [`${base}.${ext}`, `${base}/index.${ext}`])]
  for (const c of candidates) if (files.has(c)) return c
  return null
}

function resolveRelative(fromFile: string, specifier: string, files: Set<string>): string | null {
  return resolveDirect(normalize(`${dirname(fromFile)}/${specifier}`), files)
}

/** Resolve a non-relative specifier using tsconfig-style or vite aliases. */
function resolveAlias(specifier: string, aliases: Alias[], files: Set<string>): { path: string; alias: Alias } | null {
  for (const alias of aliases) {
    if (specifier === alias.pattern) {
      const direct = resolveDirect(alias.target, files)
      if (direct) return { path: direct, alias }
    } else if (specifier.startsWith(`${alias.pattern}/`)) {
      const rest = specifier.slice(alias.pattern.length + 1)
      const direct = resolveDirect(`${alias.target}/${rest}`, files)
      if (direct) return { path: direct, alias }
    }
  }
  return null
}

/** Build an alias table from tsconfig/jsconfig paths and vite/webpack configs. */
export function extractAliases(configs: ConfigFile[]): Alias[] {
  const aliases: Alias[] = []
  const seen = new Set<string>()
  const push = (pattern: string, target: string) => {
    const key = `${pattern}->${target}`
    if (seen.has(key)) return
    seen.add(key)
    aliases.push({ pattern, target })
  }
  for (const cfg of configs) {
    const base = dirname(cfg.path)
    const json = cfg.json
    if (json && (cfg.path.endsWith('tsconfig.json') || cfg.path.endsWith('jsconfig.json'))) {
      const co = ((json.compilerOptions ?? {}) as Record<string, unknown>)
      const paths = co.paths as Record<string, unknown> | undefined
      if (paths && typeof paths === 'object') {
        const baseUrl = normalize(`${base}/${typeof co.baseUrl === 'string' ? co.baseUrl : '.'}`)
        for (const [pattern, targets] of Object.entries(paths)) {
          if (!Array.isArray(targets) || typeof targets[0] !== 'string') continue
          const pat = pattern.endsWith('/*') ? pattern.slice(0, -2) : pattern
          const tgt = String(targets[0]).replace(/^\.\//, '').replace(/\/\*$/, '')
          push(pat, normalize(`${baseUrl}/${tgt}`))
        }
      }
    }
    // vite.config / webpack resolve.alias — regex-based heuristic
    if (/(vite|webpack|rollup|next|nuxt)\.config\./.test(cfg.path) || cfg.path.endsWith('.config.ts') || cfg.path.endsWith('.config.js')) {
      const pats = [...cfg.text.matchAll(/["'`](@[^"'`\s]*?)["'`]\s*[:,]/g)].map((m) => m[1].replace(/\/+$/, ''))
      const tgt = /src/.test(cfg.text) ? 'src' : '.'
      for (const pat of pats) if (pat && pat !== '@') push(pat, normalize(`${base}/${tgt}`))
    }
  }
  return aliases
}

/** Tarjan SCC — cycles are components with more than one node, plus self-loops. */
function findCycles(adjacency: Map<string, string[]>): string[][] {
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Map<string, boolean>()
  const stack: string[] = []
  const cycles: string[][] = []
  const strongConnect = (v: string) => {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.set(v, true)
    for (const w of adjacency.get(v) ?? []) {
      if (!idx.has(w)) {
        strongConnect(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.get(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = []
      let w: string | undefined
      do {
        w = stack.pop()
        onStack.set(w!, false)
        scc.push(w!)
      } while (w !== v)
      if (scc.length > 1 || (adjacency.get(v) ?? []).includes(v)) cycles.push(scc.reverse())
    }
  }
  for (const node of adjacency.keys()) if (!idx.has(node)) strongConnect(node)
  return cycles
}

function detectEntries(files: FileInfo[], configs: ConfigFile[]): Set<string> {
  const entries = new Set<string>()
  const fileSet = new Set(files.map((f) => f.path))
  for (const cfg of configs) {
    if (!cfg.path.endsWith('package.json') || !cfg.json) continue
    const pkg = cfg.json as Record<string, unknown>
    const collect = (v: unknown) => {
      if (typeof v !== 'string') return
      const resolved = resolveDirect(normalize(v), fileSet)
      if (resolved) entries.add(resolved)
    }
    collect(pkg.main)
    collect(pkg.module)
    if (typeof pkg.bin === 'string') collect(pkg.bin)
    else if (pkg.bin && typeof pkg.bin === 'object') Object.values(pkg.bin as Record<string, unknown>).forEach(collect)
    if (pkg.exports && typeof pkg.exports === 'object') {
      const walk = (node: unknown) => {
        if (typeof node === 'string') collect(node.replace(/^\.\//, ''))
        else if (node && typeof node === 'object') Object.values(node as Record<string, unknown>).forEach(walk)
      }
      walk(pkg.exports)
    }
  }
  return entries
}

/** Longest dependency chain via DP over a topological order (cycle nodes dropped). */
function longestChains(files: FileInfo[], cycles: string[][]): string[][] {
  const cyclic = new Set(cycles.flat())
  const importsOf = new Map<string, string[]>()
  const importersOf = new Map<string, string[]>()
  const pending = new Map<string, number>()
  for (const f of files) {
    if (cyclic.has(f.id)) continue
    const targets = f.imports.filter((r) => r.resolved && !cyclic.has(r.resolved)).map((r) => r.resolved!)
    importsOf.set(f.id, targets)
    pending.set(f.id, targets.length)
    importersOf.set(f.id, importersOf.get(f.id) ?? [])
    for (const t of targets) {
      if (cyclic.has(t)) continue
      importersOf.set(t, [...(importersOf.get(t) ?? []), f.id])
    }
  }
  const queue = [...importsOf.keys()].filter((id) => (pending.get(id) ?? 0) === 0)
  const best = new Map<string, string[]>(queue.map((id) => [id, [id]]))
  while (queue.length) {
    const id = queue.pop()!
    const chain = best.get(id)!
    for (const parent of importersOf.get(id) ?? []) {
      const cand = [parent, ...chain]
      if ((best.get(parent)?.length ?? 0) < cand.length) best.set(parent, cand)
      pending.set(parent, (pending.get(parent) ?? 1) - 1)
      if ((pending.get(parent) ?? 0) === 0) queue.push(parent)
    }
  }
  return [...best.values()].sort((a, b) => b.length - a.length).slice(0, 5)
}

function computeMetrics(files: FileInfo[], cycles: string[][], entries: Set<string>): Metrics {
  const fanInTop = [...files].sort((a, b) => b.fanIn - a.fanIn).slice(0, 5)
  const fanOutTop = [...files].sort((a, b) => b.fanOut - a.fanOut).slice(0, 5)
  const mostUnstable = files
    .filter((f) => f.fanIn + f.fanOut > 0)
    .sort((a, b) => b.instability - a.instability)
    .slice(0, 5)
  const orphans = files.filter((f) => f.fanIn === 0 && f.fanOut === 0).map((f) => f.path)

  const pairCount = new Map<string, number>()
  for (const f of files) {
    for (const r of f.imports) {
      if (!r.resolved) continue
      const a = dirname(f.path) || '.'
      const b = dirname(r.resolved) || '.'
      if (a === b) continue
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
    }
  }
  const directoryCoupling = [...pairCount.entries()]
    .map(([k, count]) => [k.split('|'), count] as [string[], number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([[a, b], count]) => ({ a, b, count }))

  return {
    fanInTop,
    fanOutTop,
    mostUnstable,
    orphans,
    entryPoints: [...entries],
    directoryCoupling,
    deepestChains: longestChains(files, cycles),
  }
}

export function analyze(repoFiles: RawFile[], rootName: string, configs: ConfigFile[] = []): Analysis {
  const t0 = performance.now()
  const filesSet = new Set(repoFiles.map((f) => f.path))
  const files: FileInfo[] = []
  const adjacency = new Map<string, string[]>()
  const edges: GraphEdge[] = []
  const edgeSet = new Set<string>()
  const aliases = extractAliases(configs)
  const byKind: Record<DepKind, number> = { esm: 0, dynamic: 0, require: 0, type: 0 }
  let unresolvedCount = 0
  let externalCount = 0
  let aliasedEdges = 0

  for (const f of repoFiles) {
    const imports = parseImports(f.text)
    const targets = new Set<string>()
    for (const ref of imports) {
      byKind[ref.kind]++
      const markExternal = () => {
        ref.external = true
        externalCount++
      }
      if (ref.relative && !ASSET_RE.test(ref.specifier)) {
        const resolved = resolveRelative(f.path, ref.specifier, filesSet)
        ref.resolved = resolved
        ref.unresolved = resolved === null
        if (resolved) targets.add(resolved)
        else unresolvedCount++
      } else {
        const viaAlias = resolveAlias(ref.specifier, aliases, filesSet)
        if (viaAlias) {
          ref.resolved = viaAlias.path
          ref.viaAlias = viaAlias.alias.pattern
          aliasedEdges++
          targets.add(viaAlias.path)
        } else if (ref.specifier.startsWith('#')) {
          const resolved = resolveDirect(ref.specifier.slice(1), filesSet)
          if (resolved) {
            ref.resolved = resolved
            targets.add(resolved)
          } else markExternal()
        } else markExternal()
      }
    }
    adjacency.set(f.path, [...targets])
    for (const t of targets) {
      const key = `${f.path}->${t}`
      if (edgeSet.has(key)) continue
      edgeSet.add(key)
      const kind = imports.find((r) => r.resolved === t)?.kind ?? 'esm'
      edges.push({ source: f.path, target: t, kind, inCycle: false })
    }
    files.push({
      id: f.path,
      name: f.name,
      path: f.path,
      ext: f.ext,
      loc: f.text.split('\n').length,
      imports,
      importedBy: [],
      problems: [],
      inCycle: false,
      isEntry: false,
      fanIn: 0,
      fanOut: targets.size,
      instability: 0,
    })
  }

  const byId = new Map(files.map((f) => [f.id, f]))
  for (const e of edges) byId.get(e.target)?.importedBy.push(e.source)
  for (const f of files) {
    f.fanIn = f.importedBy.length
    f.instability = f.fanIn + f.fanOut === 0 ? 0 : f.fanOut / (f.fanIn + f.fanOut)
  }

  const cycles = findCycles(adjacency)
  const cyclicNodes = new Set(cycles.flat())
  const cyclicPairs = new Set<string>()
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i++) cyclicPairs.add(`${cycle[i]}->${cycle[(i + 1) % cycle.length]}`)
  }
  for (const f of files) f.inCycle = cyclicNodes.has(f.id)
  for (const e of edges) e.inCycle = cyclicPairs.has(`${e.source}->${e.target}`)

  const entrySet = detectEntries(files, configs)
  for (const f of files) f.isEntry = entrySet.has(f.id) && f.fanIn === 0

  const deepest = longestChains(files, cycles)
  const deepNodes = new Set(deepest.filter((c) => c.length >= 10).flat())
  const basenameCounts = new Map<string, number>()
  for (const f of files) basenameCounts.set(f.name, (basenameCounts.get(f.name) ?? 0) + 1)

  for (const f of files) {
    const problems: string[] = []
    if (f.inCycle) {
      const cycle = cycles.find((c) => c.includes(f.id))
      problems.push(`Circular dependency: ${[...cycle!, cycle![0]].join(' → ')}`)
    }
    for (const r of f.imports) {
      if (r.unresolved && !r.external) problems.push(`Unresolved import '${r.specifier}' (line ${r.line})`)
    }
    const kinds = new Set(f.imports.map((r) => r.kind))
    if (kinds.has('require') && (kinds.has('esm') || kinds.has('dynamic'))) {
      problems.push('Mixes require() with ESM imports/dynamic imports')
    }
    // barrel: every import is a re-export (index that only forwards)
    if (f.imports.length > 0 && f.imports.every((r) => r.reexport)) {
      problems.push('Barrel file — re-exports everything it imports (bundler caveat: can hide cycles and bloat bundles)')
    }
    if (deepNodes.has(f.id)) {
      const chain = deepest.find((c) => c.includes(f.id))!
      problems.push(`Long dependency chain (${chain.length} files): ${chain.join(' → ')}`)
    }
    if ((basenameCounts.get(f.name) ?? 0) > 1 && f.ext === 'ts' && /^index\.(ts|tsx)$/.test(f.name)) {
      problems.push(`Duplicate basename '${f.name}' in ${basenameCounts.get(f.name)} directories`)
    }
    if (/\.(test|spec)\.[jt]sx?$/.test(f.name) && f.fanIn === 0) {
      problems.push('Test file is never imported — run it via your test runner, not worth graphing')
    }
    f.problems = problems
  }

  const byExt: Record<Ext, number> = { js: 0, jsx: 0, ts: 0, tsx: 0 }
  let totalLoc = 0
  for (const f of files) {
    byExt[f.ext]++
    totalLoc += f.loc
  }

  return {
    rootName,
    files,
    edges,
    cycles,
    aliases: aliases.map((a) => ({ pattern: a.pattern, target: a.target })),
    metrics: { ...computeMetrics(files, cycles, entrySet), deepestChains: deepest },
    stats: {
      files: files.length,
      edges: edges.length,
      cycles: cycles.length,
      unresolved: unresolvedCount,
      external: externalCount,
      aliasedEdges,
      byExt,
      byKind,
      loc: totalLoc,
      scannedMs: Math.round(performance.now() - t0),
    },
  }
}
