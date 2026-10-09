import { useMemo, useState, type ReactNode } from 'react'
import type { Analysis, Ext, FileInfo } from '../lib/types'

interface Props {
  analysis: Analysis
  query: string
  onQuery: (q: string) => void
  enabledExts: Set<Ext>
  onToggleExt: (e: Ext) => void
  problemsOnly: boolean
  onProblemsOnly: (v: boolean) => void
  enabledKinds: Set<'esm' | 'dynamic' | 'require' | 'type'>
  onToggleKind: (k: 'esm' | 'dynamic' | 'require' | 'type') => void
  selectedId: string | null
  onSelect: (id: string) => void
  onTraceCycle: (cycle: string[] | null) => void
  tracedCycle: string[] | null
  snapshotsTab: ReactNode
}

type Tab = 'files' | 'cycles' | 'metrics' | 'snapshots'

const EXT_LABELS: { ext: Ext; label: string; color: string }[] = [
  { ext: 'ts', label: '.ts', color: '#3b82f6' },
  { ext: 'tsx', label: '.tsx', color: '#06b6d4' },
  { ext: 'js', label: '.js', color: '#eab308' },
  { ext: 'jsx', label: '.jsx', color: '#f97316' },
]
const KIND_LABELS: { kind: 'esm' | 'dynamic' | 'require' | 'type'; label: string }[] = [
  { kind: 'esm', label: 'ESM' },
  { kind: 'type', label: 'types' },
  { kind: 'dynamic', label: 'dynamic' },
  { kind: 'require', label: 'require' },
]

export default function Sidebar(props: Props) {
  const { analysis, query, onQuery, enabledExts, onToggleExt, problemsOnly, onProblemsOnly, enabledKinds, onToggleKind, selectedId, onSelect, onTraceCycle, tracedCycle } = props
  const [tab, setTab] = useState<Tab>('files')
  const { stats, metrics, cycles } = analysis

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return analysis.files.filter((f) => {
      if (!enabledExts.has(f.ext)) return false
      if (problemsOnly && f.problems.length === 0) return false
      if (q && !f.path.toLowerCase().includes(q)) return false
      return true
    })
  }, [analysis.files, enabledExts, problemsOnly, query])

  const LIST_CAP = 500

  return (
    <aside className="sidebar">
      <section className="panel">
        <h2>Repository</h2>
        <p className="repo-name" title={analysis.rootName}>{analysis.rootName}</p>
        <ul className="stats">
          <li><b>{stats.files}</b> files</li>
          <li><b>{stats.edges}</b> edges</li>
          <li><b className="bad">{stats.cycles}</b> cycles</li>
          <li><b className="warn">{stats.unresolved}</b> unresolved</li>
        </ul>
        <div className="ext-grid">
          {EXT_LABELS.map(({ ext, label, color }) => (
            <label key={ext} className="ext-toggle">
              <input type="checkbox" checked={enabledExts.has(ext)} onChange={() => onToggleExt(ext)} />
              <i style={{ background: color }} />
              {label} {stats.byExt[ext] || 0}
            </label>
          ))}
        </div>
        <label className="problems-toggle">
          <input type="checkbox" checked={problemsOnly} onChange={(e) => onProblemsOnly(e.target.checked)} />
          Show only files with problems
        </label>
      </section>

      <nav className="tabs" role="tablist">
        {(['files', 'cycles', 'metrics', 'snapshots'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'cycles' ? `Cycles (${cycles.length})` : t === 'metrics' ? 'Metrics' : t === 'snapshots' ? 'Snapshots' : 'Files'}
          </button>
        ))}
      </nav>

      {tab === 'files' && (
        <section className="panel">
          <h2>Search</h2>
          <input
            type="search"
            placeholder="Filter by path or name…  ( / )"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          <div className="edge-kinds">
            {KIND_LABELS.map(({ kind, label }) => (
              <label key={kind} className="chip-toggle">
                <input type="checkbox" checked={enabledKinds.has(kind)} onChange={() => onToggleKind(kind)} />
                <span className={`chip k-${kind}`}>{label}</span>
              </label>
            ))}
          </div>
          <div className="file-list" role="listbox" aria-label="Files">
            {visibleFiles.slice(0, LIST_CAP).map((f) => (
              <button
                key={f.id}
                type="button"
                role="option"
                aria-selected={f.id === selectedId}
                className={`file-row${f.id === selectedId ? ' selected' : ''}`}
                onClick={() => onSelect(f.id)}
              >
                <span className="file-path" title={f.path}>
                  {f.isEntry && <em className="entry" title="entry point">◆</em>}{f.path}
                </span>
                <span className="file-meta">
                  {f.problems.length > 0 && <em className="flag" title={`${f.problems.length} problem(s)`}>●</em>}
                  {f.loc}
                </span>
              </button>
            ))}
            {visibleFiles.length === 0 && <p className="muted">No files match.</p>}
            {visibleFiles.length > LIST_CAP && <p className="muted">+{visibleFiles.length - LIST_CAP} more — refine your search…</p>}
          </div>
        </section>
      )}

      {tab === 'cycles' && (
        <section className="panel">
          <h2>Circular dependencies <span className="count">{cycles.length}</span></h2>
          {cycles.length === 0 && <p className="ok">No cycles detected — clean graph 🎯</p>}
          <ul className="cycle-list">
            {cycles.map((c, i) => (
              <li key={i} className={tracedCycle && tracedCycle[0] === c[0] && tracedCycle.length === c.length ? 'traced' : ''}>
                <button type="button" className="cycle-trace" onClick={() => onTraceCycle(tracedCycle ? null : c)}>
                  {tracedCycle ? 'Stop trace' : 'Trace'}
                </button>
                <div className="cycle-path" onClick={() => onSelect(c[0])}>
                  {c.map((p, j) => (
                    <span key={`${p}-${j}`}>
                      <button type="button" className="link" onClick={() => onSelect(p)}>{p.split('/').pop()}</button>
                      <span className="muted"> → </span>
                    </span>
                  ))}
                  <button type="button" className="link" onClick={() => onSelect(c[0])}>{c[0].split('/').pop()}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'metrics' && (
        <section className="panel metrics-panel">
          <h2>Top fan-in</h2>
          <ul className="mini-list">
            {metrics.fanInTop.map((m) => (
              <li key={m.path}><button type="button" className="link" onClick={() => onSelect(m.path)}>{m.path}</button><span>← {m.fanIn}</span></li>
            ))}
          </ul>
          <h2>Top fan-out</h2>
          <ul className="mini-list">
            {metrics.fanOutTop.map((m) => (
              <li key={m.path}><button type="button" className="link" onClick={() => onSelect(m.path)}>{m.path}</button><span>→ {m.fanOut}</span></li>
            ))}
          </ul>
          <h2>Most unstable</h2>
          <ul className="mini-list">
            {metrics.mostUnstable.map((m) => (
              <li key={m.path}><button type="button" className="link" onClick={() => onSelect(m.path)}>{m.path}</button><span>{m.instability.toFixed(2)}</span></li>
            ))}
          </ul>
          <h2>Directory coupling</h2>
          <ul className="mini-list">
            {metrics.directoryCoupling.map(({ a, b, count }) => (
              <li key={`${a}|${b}`}><span className="muted">{a} ↔ {b}</span><span>{count}</span></li>
            ))}
          </ul>
          <h2>Entry points ({metrics.entryPoints.length})</h2>
          <ul className="mini-list">
            {metrics.entryPoints.slice(0, 8).map((p) => (
              <li key={p}><button type="button" className="link" onClick={() => onSelect(p)}>{p}</button><span>◆</span></li>
            ))}
            {metrics.entryPoints.length === 0 && <li><span className="muted">None detected</span></li>}
          </ul>
          <h2>Orphans ({metrics.orphans.length})</h2>
          <OrphanList analysis={analysis} onSelect={onSelect} />
        </section>
      )}

      {tab === 'snapshots' && <section className="panel">{props.snapshotsTab}</section>}
    </aside>
  )
}

function OrphanList({ analysis, onSelect }: { analysis: Analysis; onSelect: (id: string) => void }) {
  const orphans: FileInfo[] = analysis.metrics.orphans.map((p) => analysis.files.find((f) => f.path === p)!).filter(Boolean)
  return (
    <ul className="mini-list">
      {orphans.slice(0, 8).map((f) => (
        <li key={f.id}><button type="button" className="link" onClick={() => onSelect(f.id)}>{f.path}</button><span>0/0</span></li>
      ))}
      {orphans.length > 8 && <li><span className="muted">+{orphans.length - 8} more</span></li>}
      {orphans.length === 0 && <li><span className="muted">None — every file is connected</span></li>}
    </ul>
  )
}
