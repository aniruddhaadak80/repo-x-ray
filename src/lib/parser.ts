import type { DepKind, ImportRef } from './types'

const ESM_RE = /\bimport\s+(type\s+)?(?:[^'"`]*?\sfrom\s*)?['"]([^'"]+)['"]/g
const REEXPORT_RE = /\bexport\s+(?:\*(?:\s+as\s*[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const SUBPATH_RE = /\bimport\s*['"](#[^'"]+)['"]/g

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

function lineOf(src: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (src[i] === '\n') line++
  return line
}

function ref(specifier: string, kind: DepKind, src: string, index: number): ImportRef {
  return {
    specifier,
    kind,
    line: lineOf(src, index),
    relative: specifier.startsWith('.'),
    resolved: null,
    unresolved: false,
    external: false,
  }
}

function collect(re: RegExp, src: string, kind: DepKind): ImportRef[] {
  const out: ImportRef[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const specifier = m[1]
    out.push(ref(specifier, kind, src, m.index))
  }
  return out
}

/** Detect imports / re-exports / dynamic imports / require() calls. */
export function parseImports(source: string): ImportRef[] {
  const src = stripComments(source)

  // ES imports (with `import type` retagging)
  const esm: ImportRef[] = []
  ESM_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ESM_RE.exec(src))) {
    const kind: DepKind = m[1] ? 'type' : 'esm'
    esm.push(ref(m[2], kind, src, m.index))
  }

  const subpaths = collect(SUBPATH_RE, src, 'esm')
  return dedupe([
    ...esm,
    ...collect(REEXPORT_RE, src, 'esm'),
    ...collect(DYNAMIC_RE, src, 'dynamic'),
    ...collect(REQUIRE_RE, src, 'require'),
    ...subpaths,
  ])
}

function dedupe(refs: ImportRef[]): ImportRef[] {
  const seen = new Set<string>()
  return refs.filter((r) => {
    const key = `${r.specifier}|${r.kind}|${r.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
