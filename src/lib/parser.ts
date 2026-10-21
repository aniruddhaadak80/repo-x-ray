import type { DepKind, ImportRef } from './types'

const ESM_RE = /\bimport\s+(type\s+)?(?:[^'"`]*?\sfrom\s*)?['"]([^'"]+)['"]/g
const REEXPORT_RE = /\bexport\s+(?:\*(?:\s+as\s*[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const SUBPATH_RE = /\bimport\s*['"](#[^'"]+)['"]/g

/**
 * Remove comments, keeping string literals intact.
 *
 * A single left-to-right scan rather than a regex pass, because a `//` is
 * only a comment when it is not inside a string: `import x from
 * 'https://cdn.example.com/x.js'` is an import, and `code; // import y from
 * './ghost'` is a comment. Newlines are preserved so line numbers still
 * line up with the original file.
 */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]!
    const next = i + 1 < n ? src[i + 1] : ''

    // Line comment: // to end of line.
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' '
        i += 1
      }
      continue
    }

    // Block comment: /* ... */
    if (ch === '/' && next === '*') {
      out += '  '
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i += 1
      }
      out += '  '
      i = Math.min(n, i + 2)
      continue
    }

    // String literal: copied verbatim, escapes included.
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      out += ch
      i += 1
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] ?? ''
          out += src[i + 1] ?? ''
          i += 2
          continue
        }
        out += src[i]!
        if (src[i] === quote) {
          i += 1
          break
        }
        i += 1
      }
      continue
    }

    out += ch
    i += 1
  }
  return out
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

  // `export ... from` re-exports are imports too
  const reexports: ImportRef[] = []
  REEXPORT_RE.lastIndex = 0
  while ((m = REEXPORT_RE.exec(src))) {
    const r = ref(m[1], 'esm', src, m.index)
    r.reexport = true
    reexports.push(r)
  }

  const subpaths = collect(SUBPATH_RE, src, 'esm')
  return dedupe([...esm, ...reexports, ...collect(DYNAMIC_RE, src, 'dynamic'), ...collect(REQUIRE_RE, src, 'require'), ...subpaths])
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
