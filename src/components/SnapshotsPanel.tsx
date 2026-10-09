import { useEffect, useState } from 'react'
import type { Analysis } from '../lib/types'
import { deleteScan, listScans, type ScanRecord } from '../lib/snapshots'

interface Props {
  onLoad: (analysis: Analysis, rootName: string) => void
  currentRoot: string
  /** record selected as the "before" side of comparison */
  compareId: string | null
  onCompareSelect: (record: ScanRecord | null) => void
}

function fmt(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SnapshotsPanel({ onLoad, currentRoot, compareId, onCompareSelect }: Props) {
  const [scans, setScans] = useState<ScanRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listScans()
      .then(setScans)
      .catch((e) => setError(String(e)))
  }, [])

  const remove = async (id: string) => {
    await deleteScan(id)
    setScans(await listScans())
    if (compareId === id) onCompareSelect(null)
  }

  if (error) return <p className="error">Snapshot storage unavailable: {error}</p>
  if (scans === null) return <p className="muted">Loading snapshots…</p>
  if (scans.length === 0) {
    return (
      <p className="muted">
        No snapshots yet. Click <b>Save scan</b> in the toolbar, then pick a saved scan here to
        compare it against the repo currently loaded.
      </p>
    )
  }

  return (
    <div className="snapshots">
      <ul className="scan-list">
        {scans.map((s) => (
          <li key={s.id} className={compareId === s.id ? 'selected' : ''}>
            <label className="scan-radio">
              <input
                type="radio"
                name="compare-base"
                checked={compareId === s.id}
                onChange={() => onCompareSelect(compareId === s.id ? null : s)}
              />
              <span className="scan-name">{s.rootName}</span>
            </label>
            <div className="scan-meta">
              <span className="muted">{fmt(s.savedAt)}</span>
              <span className="muted">{s.analysis.stats.files} files · {s.analysis.stats.cycles} cycles</span>
            </div>
            <div className="scan-actions">
              <button type="button" className="small-btn" onClick={() => onLoad(s.analysis, s.rootName)}>Open</button>
              <button type="button" className="small-btn ghost" onClick={() => remove(s.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">
        The selected scan becomes the <b>“before”</b> side of the Compare view; the currently loaded
        repo{currentRoot ? ` (<b>${currentRoot}</b>)` : ''} is the “after” side.
      </p>
    </div>
  )
}
