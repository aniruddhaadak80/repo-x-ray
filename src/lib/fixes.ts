import type { Analysis, FileInfo, ImportRef } from './types'

export interface Suggestion {
  id: string
  title: string
  rationale: string
  /** code snippet to apply manually */
  code?: string
  /** where the fix applies */
  target: string
  severity: 'warn' | 'info'
}

/** Levenshtein distance for candidate ranking. */
function dist(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[m][n]
}

function closestMatch(specifier: string, analysis: Analysis): string | null {
  const base = specifier.split('/').pop() ?? specifier
  let best: { path: string; score: number } | null = null
  for (const f of analysis.files) {
    const stem = f.name.replace(/\.[^.]+$/, '')
    const d = dist(base, stem)
    if (d <= Math.max(2, Math.floor(base.length / 3)) && (!best || d < best.score)) {
      best = { path: f.path, score: d }
    }
  }
  return best?.path ?? null
}

/** Suggest a minimal fix for an unresolved import (typo / moved file). */
export function suggestUnresolvedFix(ref: ImportRef, file: FileInfo, analysis: Analysis): Suggestion[] {
  const out: Suggestion[] = []
  const match = closestMatch(ref.specifier, analysis)
  if (match) {
    const dir = file.path.split('/').slice(0, -1).join('/')
    const rel = relativePath(dir, match)
    out.push({
      id: `unresolved:${file.id}:${ref.specifier}:${ref.line}`,
      title: `Point '${ref.specifier}' at the moved file`,
      rationale: `'${ref.specifier}' doesn't resolve, but '${match}' exists and is the closest match.`,
      code: `- import x from '${ref.specifier}'\n+ import x from '${rel}'`,
      target: match,
      severity: 'warn',
    })
  }
  if (ref.specifier.includes('/') && !ref.specifier.startsWith('.') && !ref.specifier.startsWith('@/')) {
    out.push({
      id: `unresolved-alias:${file.id}:${ref.specifier}:${ref.line}`,
      title: 'Check your tsconfig/vite aliases',
      rationale: `'${ref.specifier}' looks like an alias. ${analysis.aliases.length ? `Detected: ${analysis.aliases.map((a) => `${a.pattern}/*`).join(', ')}.` : 'No aliases detected in tsconfig/jsconfig/vite config.'}`,
      code: `// tsconfig.json\n"compilerOptions": { "paths": { "@/*": ["src/*"] } }`,
      target: ref.specifier,
      severity: 'warn',
    })
  }
  return out
}

function relativePath(fromDir: string, toPath: string): string {
  const from = fromDir ? fromDir.split('/') : []
  const to = toPath.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  const up = from.slice(i).map(() => '..')
  const rest = to.slice(i)
  const out = [...up, ...rest].join('/')
  return out.startsWith('.') ? out : `./${out}`
}

/** Suggest the cheapest cycle break: make the back-edge a dynamic import. */
export function suggestCycleBreak(file: FileInfo, analysis: Analysis): Suggestion[] {
  if (!file.inCycle) return []
  const cycle = analysis.cycles.find((c) => c.includes(file.id))
  if (!cycle) return []
  const i = cycle.indexOf(file.id)
  const next = cycle[(i + 1) % cycle.length]
  const backEdge = next === file.id ? file.id : next
  return [
    {
      id: `cycle:${file.id}`,
      title: `Break the cycle by lazy-loading '${backEdge}'`,
      rationale:
        cycle.length === 1
          ? 'This file imports itself — the import is likely only needed at call time.'
          : `Cycle: ${[...cycle, cycle[0]].join(' → ')}. Converting the back-edge import to a dynamic import() defers evaluation and breaks the cycle at module-init time.`,
      code: `// in ${file.id}\n- import { x } from '${backEdge === file.id ? './self' : backEdge}'\n+ const { x } = await import('${backEdge === file.id ? './self' : backEdge}') // at call site`,
      target: backEdge,
      severity: 'warn',
    },
  ]
}

/** Suggest converting require() to ESM. */
export function suggestEsmFix(file: FileInfo): Suggestion[] {
  const requires = file.imports.filter((r) => r.kind === 'require')
  const hasEsm = file.imports.some((r) => r.kind === 'esm' || r.kind === 'dynamic')
  if (requires.length === 0 || !hasEsm) return []
  return [
    {
      id: `mixed:${file.id}`,
      title: 'Unify on one module system',
      rationale: `Mixing require() with ESM breaks tree-shaking and ESM/CJS interop in bundlers. ${requires.length} require call(s) found.`,
      code: requires.map((r) => `- const x = require('${r.specifier}')\n+ import x from '${r.specifier}'`).join('\n'),
      target: file.id,
      severity: 'warn',
    },
  ]
}

/** All suggestions for a file. */
export function suggestionsFor(file: FileInfo, analysis: Analysis): Suggestion[] {
  const out: Suggestion[] = [...suggestCycleBreak(file, analysis)]
  for (const ref of file.imports) {
    if (ref.unresolved && !ref.external) out.push(...suggestUnresolvedFix(ref, file, analysis))
  }
  out.push(...suggestEsmFix(file))
  return out
}

/** Repo-level suggestions (dependency audit, barrels). */
export function repoSuggestions(analysis: Analysis): Suggestion[] {
  const out: Suggestion[] = []
  for (const issue of analysis.metrics.depIssues.slice(0, 50)) {
    out.push({
      id: `dep:${issue.declaredIn}:${issue.kind}:${issue.name}`,
      title: `${issue.name}: ${issue.message}`,
      rationale: `Declared in ${issue.declaredIn} as ${issue.kind}.`,
      code: `- "${issue.name}": "${issue.spec}"`,
      target: issue.declaredIn,
      severity: issue.level,
    })
  }
  return out
}
