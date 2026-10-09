import { useEffect, useMemo, useRef, useState } from 'react'

export interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

interface Props {
  commands: Command[]
  files: { id: string }[]
  onPickFile: (id: string) => void
  onClose: () => void
}

/** Fuzzy subsequence match — "gvc" matches "GraphView.tsx". */
function fuzzy(needle: string, haystack: string): number {
  if (!needle) return 0
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  let hi = 0
  let score = 0
  for (const ch of n) {
    const found = h.indexOf(ch, hi)
    if (found === -1) return -1
    score += 10 - Math.min(9, found - hi)
    hi = found + 1
  }
  return score - h.length * 0.01
}

export default function CommandPalette({ commands, files, onPickFile, onClose }: Props) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const fileResults = useMemo(() => {
    if (!q.trim()) return []
    return files
      .map((f) => ({ id: f.id, score: fuzzy(q, f.id) }))
      .filter((f) => f.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    }, [files, q])

  const commandResults = useMemo(
    () => commands.map((c) => ({ c, score: fuzzy(q, `${c.label} ${c.hint ?? ''}`) })).filter((x) => x.score >= 0).slice(0, 8),
    [commands, q],
  )

  const rows = [
    ...fileResults.map((f) => ({ kind: 'file' as const, id: f.id, label: f.id, hint: 'file' })),
    ...commandResults.map((x) => ({ kind: 'cmd' as const, id: x.c.id, label: x.c.label, hint: x.c.hint })),
  ].slice(0, 12)

  const onQueryChange = (value: string) => {
    setQ(value)
    setActive(0)
  }

  const execute = (row: (typeof rows)[number]) => {
    if (row.kind === 'file') onPickFile(row.id)
    else commands.find((c) => c.id === row.id)?.run()
    onClose()
  }

  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose} role="presentation">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search files or run a command…  (try: layout, color, export, cycle, save, compare)"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); const row = rows[active]; if (row) execute(row) }
            else if (e.key === 'Escape') { e.preventDefault(); onClose() }
          }}
        />
        <ul className="palette-list" ref={listRef}>
          {rows.map((row, i) => (
            <li key={`${row.kind}-${row.id}`}>
              <button
                type="button"
                className={`palette-row${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => execute(row)}
              >
                <span className={`palette-kind k-${row.kind}`}>{row.hint ?? row.kind}</span>
                <span className="palette-label">{row.label}</span>
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="muted palette-empty">No matches</li>}
        </ul>
        <footer className="palette-footer muted small">
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
        </footer>
      </div>
    </div>
  )
}
