import { useState } from 'react'
import type { Analysis } from '../lib/types'
import { diffScans, type ScanDiff } from '../lib/diff'

interface Props {
  before: Analysis // snapshot
  after: Analysis // current
  onClose: () => void
}

function List({ title, items, kind }: { title: string; items: string[]; kind: 'add' | 'del' | 'chg' }) {
  const [open, setOpen] = useState(items.length <= 12)
  return (
    <div className={`diff-block ${kind}`}>
      <button type="button" className="diff-head" onClick={() => setOpen((o) => !o)}>
        <span className={`diff-dot ${kind}`} />
        {title} <b>{items.length}</b>
        <span className="muted small">{open ? '▾' : '▸'}</span>
      </button>
      {open && items.length > 0 && (
        <ul className="diff-list">
          {items.slice(0, 200).map((p) => <li key={p}><code>{p}</code></li>)}
          {items.length > 200 && <li className="muted">+{items.length - 200} more…</li>}
        </ul>
      )}
    </div>
  )
}

export default function CompareDialog({ before, after, onClose }: Props) {
  const d: ScanDiff = diffScans(before, after)
  const delta = (n: number) => (n > 0 ? `+${n}` : String(n))
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Compare — <code>{before.rootName}</code> → <code>{after.rootName}</code></h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-toolbar diff-summary">
          <span className="muted">Files <b className={d.filesAdded.length || d.filesRemoved.length ? 'warn' : ''}>{delta(after.stats.files - before.stats.files)}</b></span>
          <span className="muted">Edges <b className="warn">{delta(after.stats.edges - before.stats.edges)}</b></span>
          <span className={`muted`}>Cycles <b className={d.cyclesAfter > d.cyclesBefore ? 'bad' : d.cyclesAfter < d.cyclesBefore ? 'ok' : ''}>{d.cyclesBefore} → {d.cyclesAfter}</b></span>
          <span className="muted">Problems <b className={d.problemsAfter > d.problemsBefore ? 'bad' : d.problemsAfter < d.problemsBefore ? 'ok' : ''}>{d.problemsBefore} → {d.problemsAfter}</b></span>
        </div>
        <div className="diff-body">
          <List title="Files added" items={d.filesAdded} kind="add" />
          <List title="Files removed" items={d.filesRemoved} kind="del" />
          <List title="Files changed" items={d.filesChanged} kind="chg" />
          <List title="New problems" items={d.newProblemFiles} kind="del" />
          <List title="Fixed problems" items={d.fixedProblemFiles} kind="add" />
          <p className="muted small">Edges: {d.edgesAdded} added, {d.edgesRemoved} removed.</p>
        </div>
      </div>
    </div>
  )
}
