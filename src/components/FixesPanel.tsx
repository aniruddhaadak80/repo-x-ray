import { useMemo, useState } from 'react'
import { repoSuggestions, suggestionsFor, type Suggestion } from '../lib/fixes'
import type { Analysis } from '../lib/types'

interface Props {
  analysis: Analysis
  fileId: string | null
  onSelect: (id: string) => void
}

function SuggestionCard({ s, onSelect }: { s: Suggestion; onSelect: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <li className={`suggestion ${s.severity}`}>
      <div className="suggestion-head">
        <span className={`s-dot ${s.severity}`} />
        <span className="s-title">{s.title}</span>
      </div>
      <p className="s-rationale">{s.rationale}</p>
      {s.code && (
        <div className="s-code-wrap">
          <pre className="s-code">{s.code}</pre>
          <button
            type="button"
            className="small-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(s.code!)
                setCopied(true)
                setTimeout(() => setCopied(false), 1400)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'copied ✓' : 'copy'}
          </button>
        </div>
      )}
      {onSelect && (
        <button type="button" className="small-btn ghost" onClick={() => onSelect(s.target)}>
          open {s.target.split('/').pop()}
        </button>
      )}
    </li>
  )
}

export default function FixesPanel({ analysis, fileId, onSelect }: Props) {
  const file = useMemo(() => analysis.files.find((f) => f.id === fileId) ?? null, [analysis, fileId])
  const fileSuggestions = useMemo(() => (file ? suggestionsFor(file, analysis) : []), [file, analysis])
  const repoLevel = useMemo(() => repoSuggestions(analysis), [analysis])

  if (!file && repoLevel.length === 0) {
    return <p className="ok">No fix suggestions — the selected file (and the repo) look clean.</p>
  }

  return (
    <div className="fixes">
      {file && (
        <>
          <h2>For {file.name} <span className="count">{fileSuggestions.length}</span></h2>
          {fileSuggestions.length === 0 ? (
            <p className="ok">Nothing to fix in this file.</p>
          ) : (
            <ul className="suggestion-list">{fileSuggestions.map((s) => <SuggestionCard key={s.id} s={s} onSelect={onSelect} />)}</ul>
          )}
        </>
      )}
      {repoLevel.length > 0 && (
        <>
          <h2>Dependency audit <span className="count">{repoLevel.length}</span></h2>
          <p className="muted small">Scanned {analysis.metrics.depCount} declared dependencies across package.json files — fully offline.</p>
          <ul className="suggestion-list">
            {repoLevel.slice(0, 20).map((s) => (
              <SuggestionCard key={s.id} s={s} onSelect={onSelect} />
            ))}
          </ul>
          {repoLevel.length > 20 && <p className="muted">+{repoLevel.length - 20} more in the JSON report</p>}
        </>
      )}
    </div>
  )
}
