import type { FileInfo, ImportRef } from '../lib/types'

interface Props {
  file: FileInfo | null
  onSelect: (id: string) => void
}

const KIND_BADGE: Record<ImportRef['kind'], string> = {
  esm: 'ESM',
  dynamic: 'dynamic',
  require: 'require',
  type: 'type',
}

function ImportList({ refs, empty, onSelect }: { refs: ImportRef[]; empty: string; onSelect: (id: string) => void }) {
  if (refs.length === 0) return <p className="muted">{empty}</p>
  return (
    <ul className="import-list">
      {refs.map((r, i) => (
        <li key={`${r.specifier}-${r.line}-${i}`}>
          <span className={`kind k-${r.kind}`}>{KIND_BADGE[r.kind]}</span>
          {r.resolved ? (
            <button type="button" className="link" onClick={() => onSelect(r.resolved!)} title={r.resolved!}>
              {r.specifier}
            </button>
          ) : (
            <code className={r.unresolved ? 'unresolved' : 'external'} title={r.unresolved ? 'Could not resolve' : 'Package / external module'}>
              {r.specifier}
            </code>
          )}
          {r.viaAlias && <span className="alias-tag" title={`Resolved via alias ${r.viaAlias}`}>alias</span>}
          <span className="line-no">:{r.line}</span>
        </li>
      ))}
    </ul>
  )
}

export default function DetailsPanel({ file, onSelect }: Props) {
  if (!file) {
    return (
      <aside className="details">
        <div className="details-head"><h2>File details</h2></div>
        <p className="muted">Select a file from the graph or the list.</p>
      </aside>
    )
  }

  const stabilityPct = Math.round((1 - file.instability) * 100)

  return (
    <aside className="details">
      <div className="details-head">
        <h2>File details</h2>
        <div className="badge-row">
          {file.isEntry && <span className="badge entry" title="Entry point — nothing imports this file">entry</span>}
          {file.inCycle && <span className="badge cycle">in cycle</span>}
        </div>
      </div>

      <dl className="kv">
        <dt>Path</dt>
        <dd><code title={file.path}>{file.path}</code></dd>
        <dt>Extension</dt>
        <dd><span className={`ext-chip chip-${file.ext}`}>.{file.ext}</span></dd>
        <dt>LOC</dt>
        <dd>{file.loc}</dd>
        <dt>Fan-in</dt>
        <dd>{file.fanIn}</dd>
        <dt>Fan-out</dt>
        <dd>{file.fanOut}</dd>
        <dt>Stability</dt>
        <dd>
          <span className="meter" aria-hidden>
            <span className="meter-fill" style={{ width: `${stabilityPct}%` }} />
          </span>
          {stabilityPct}%
        </dd>
      </dl>

      <h3>Imports ({file.imports.length})</h3>
      <ImportList refs={file.imports} empty="No imports." onSelect={onSelect} />

      <h3>Imported by ({file.importedBy.length})</h3>
      {file.importedBy.length === 0 ? (
        <p className="muted">{file.isEntry ? 'Entry point — nothing imports this file.' : 'Nothing imports this file.'}</p>
      ) : (
        <ul className="import-list">
          {file.importedBy.map((id) => (
            <li key={id}>
              <button type="button" className="link" onClick={() => onSelect(id)}>{id}</button>
            </li>
          ))}
        </ul>
      )}

      <h3>Detected problems ({file.problems.length})</h3>
      {file.problems.length === 0 ? (
        <p className="ok">No problems detected.</p>
      ) : (
        <ul className="problem-items">
          {file.problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
    </aside>
  )
}
