import type { Analysis, FileInfo } from './types'

function fmtTitle(f: FileInfo): string {
  return f.name.replace(/["\\]/g, '')
}

/** Graphviz DOT export. */
export function toDot(analysis: Analysis): string {
  const lines: string[] = ['digraph RepoXRay {', '  rankdir=LR;', '  bgcolor="#0b0e14";', '  node [style=filled, fontcolor="#e2e8f0", color="#334155"];']
  const color: Record<string, string> = { ts: '#3b82f6', tsx: '#06b6d4', js: '#eab308', jsx: '#f97316' }
  for (const f of analysis.files) {
    const fill = f.inCycle ? '#7f1d1d' : f.isEntry ? '#064e3b' : '#131a2a'
    lines.push(`  "${f.id}" [label="${fmtTitle(f)}", fillcolor="${fill}", color="${f.inCycle ? '#ef4444' : color[f.ext]}"];`)
  }
  for (const e of analysis.edges) {
    const attrs = [
      e.inCycle ? 'color="#ef4444"' : 'color="#64748b"',
      e.kind === 'dynamic' ? 'style=dashed' : e.kind === 'require' ? ', style=dotted' : '',
      e.kind === 'type' ? ', arrowhead=empty' : '',
    ].filter(Boolean).join(', ')
    lines.push(`  "${e.source}" -> "${e.target}" [${attrs}];`)
  }
  lines.push('}')
  return lines.join('\n')
}

/** Mermaid flowchart export. */
export function toMermaid(analysis: Analysis): string {
  const lines: string[] = ['graph LR']
  const id = (p: string) => `n${[...p].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1e9, 7)}`
  const classes = new Set<string>()
  for (const f of analysis.files) {
    const n = id(f.id)
    const cls = f.inCycle ? 'cycle' : f.isEntry ? 'entry' : `ext${f.ext}`
    classes.add(cls)
    lines.push(`  ${n}["${fmtTitle(f)}"]:::${cls}`)
  }
  for (const e of analysis.edges) {
    const style = e.inCycle ? ' -->' : ' -.->'
    lines.push(`  ${id(e.source)}${style}${e.kind === 'dynamic' || e.kind === 'require' ? '-' : '|'}${id(e.target)}`)
  }
  lines.push(`  classDef cycle fill:#7f1d1d,stroke:#ef4444,color:#fff;`)
  lines.push(`  classDef entry fill:#064e3b,stroke:#34d399,color:#fff;`)
  lines.push(`  classDef extts fill:#1e3a8a,color:#fff;`)
  lines.push(`  classDef exttsx fill:#155e75,color:#fff;`)
  lines.push(`  classDef extjs fill:#854d0e,color:#fff;`)
  lines.push(`  classDef extjsx fill:#7c2d12,color:#fff;`)
  return lines.join('\n')
}

/** Human-readable Markdown report. */
export function toMarkdown(analysis: Analysis): string {
  const s = analysis.stats
  const lines: string[] = []
  lines.push(`# Repo X-Ray report — \`${analysis.rootName}\``)
  lines.push('')
  lines.push(`- Files: **${s.files}** (${s.byExt.ts} ts, ${s.byExt.tsx} tsx, ${s.byExt.js} js, ${s.byExt.jsx} jsx)`)
  lines.push(`- Total LOC: ${s.loc}`)
  lines.push(`- Edges: ${s.edges} (${s.aliasedEdges} via aliases)`)
  lines.push(`- Circular dependencies: **${s.cycles}**`)
  lines.push(`- Unresolved imports: ${s.unresolved}`)
  lines.push(`- Import kinds: esm ${s.byKind.esm}, type ${s.byKind.type}, dynamic ${s.byKind.dynamic}, require ${s.byKind.require}`)
  lines.push('')
  if (analysis.cycles.length) {
    lines.push('## Cycles')
    lines.push('')
    for (const c of analysis.cycles) lines.push(`- \`${[...c, c[0]].join('` → `')}\``)
    lines.push('')
  }
  lines.push('## Top fan-in (most depended-on)')
  lines.push('')
  for (const m of analysis.metrics.fanInTop) lines.push(`- \`${m.path}\` ← ${m.fanIn}`)
  lines.push('')
  lines.push('## Top fan-out (heaviest dependents)')
  lines.push('')
  for (const m of analysis.metrics.fanOutTop) lines.push(`- \`${m.path}\` → ${m.fanOut}`)
  return lines.join('\n')
}

/** JSON report. */
export function toJsonReport(analysis: Analysis): string {
  const report = {
    generatedAt: new Date().toISOString(),
    root: analysis.rootName,
    stats: analysis.stats,
    aliases: analysis.aliases,
    cycles: analysis.cycles,
    metrics: analysis.metrics,
    files: analysis.files.map((f) => ({
      path: f.path,
      ext: f.ext,
      loc: f.loc,
      isEntry: f.isEntry,
      inCycle: f.inCycle,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
      instability: Number(f.instability.toFixed(3)),
      imports: f.imports.map((r) => ({
        specifier: r.specifier,
        kind: r.kind,
        line: r.line,
        relative: r.relative,
        resolved: r.resolved,
        unresolved: r.unresolved,
        external: r.external,
        viaAlias: r.viaAlias,
      })),
      importedBy: f.importedBy,
      problems: f.problems,
    })),
    edges: analysis.edges,
  }
  return JSON.stringify(report, null, 2)
}
