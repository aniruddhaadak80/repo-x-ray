import { useState } from 'react'
import { toDot, toJsonReport, toMarkdown, toMermaid } from '../lib/export'
import type { Analysis } from '../lib/types'

interface Props {
  analysis: Analysis
  onClose: () => void
}

type Format = 'json' | 'dot' | 'mermaid' | 'md'

const FORMATS: { id: Format; label: string; ext: string; mime: string }[] = [
  { id: 'json', label: 'JSON report', ext: 'json', mime: 'application/json' },
  { id: 'dot', label: 'Graphviz DOT', ext: 'dot', mime: 'text/vnd.graphviz' },
  { id: 'mermaid', label: 'Mermaid', ext: 'mmd', mime: 'text/plain' },
  { id: 'md', label: 'Markdown', ext: 'md', mime: 'text/markdown' },
]

function build(analysis: Analysis, format: Format): string {
  switch (format) {
    case 'json': return toJsonReport(analysis)
    case 'dot': return toDot(analysis)
    case 'mermaid': return toMermaid(analysis)
    case 'md': return toMarkdown(analysis)
  }
}

export default function ReportDialog({ analysis, onClose }: Props) {
  const [format, setFormat] = useState<Format>('json')
  const [copied, setCopied] = useState(false)
  const text = build(analysis, format)
  const lines = text.split('\n').length

  const download = () => {
    const f = FORMATS.find((x) => x.id === format)!
    const blob = new Blob([text], { type: f.mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `repo-x-ray-${analysis.rootName}.${f.ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export report" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Export report</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-toolbar">
          <div className="segmented" role="group">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" className={format === f.id ? 'active' : ''} onClick={() => setFormat(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <span className="muted small">{lines.toLocaleString()} lines</span>
            <button type="button" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            <button type="button" className="primary" onClick={download}>Download .{FORMATS.find((f) => f.id === format)!.ext}</button>
          </div>
        </div>
        <pre className="code-preview">{text.length > 200_000 ? `${text.slice(0, 200_000)}\n… truncated preview` : text}</pre>
      </div>
    </div>
  )
}
