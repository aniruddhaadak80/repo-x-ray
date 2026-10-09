import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GraphView, { type ColorMode, type LayoutMode } from './components/GraphView'
import GraphControls from './components/GraphControls'
import Sidebar from './components/Sidebar'
import DetailsPanel from './components/DetailsPanel'
import ReportDialog from './components/ReportDialog'
import { analyze } from './lib/analyze'
import { runAnalysis } from './lib/runAnalysis'
import { fsAccessSupported, pickRepoViaFsAccess, readFilesFromInput } from './lib/fs'
import { saveScan, uuid, type ScanRecord } from './lib/snapshots'
import type { Analysis, DepKind, Ext } from './lib/types'
import SnapshotsPanel from './components/SnapshotsPanel'
import CompareDialog from './components/CompareDialog'
import CommandPalette, { type Command } from './components/CommandPalette'

const ALL_EXTS: Ext[] = ['js', 'jsx', 'ts', 'tsx']
const ALL_KINDS: DepKind[] = ['esm', 'dynamic', 'require', 'type']

interface HashState {
  file?: string
  q?: string
}

function parseHash(): HashState {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const state: HashState = {}
  if (params.get('file')) state.file = params.get('file')!
  if (params.get('q')) state.q = params.get('q')!
  return state
}

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(() => parseHash().q ?? '')
  const [enabledExts, setEnabledExts] = useState<Set<Ext>>(() => new Set(ALL_EXTS))
  const [enabledKinds, setEnabledKinds] = useState<Set<DepKind>>(() => new Set(ALL_KINDS))
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layout, setLayout] = useState<LayoutMode>('force')
  const [colorMode, setColorMode] = useState<ColorMode>('ext')
  const [egoDepth, setEgoDepth] = useState(0)
  const [showLabels, setShowLabels] = useState(false)
  const [traceCycle, setTraceCycle] = useState<string[] | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [compareWith, setCompareWith] = useState<ScanRecord | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const dirInputRef = useRef<HTMLInputElement>(null)

  // keep URL in sync (file + query)
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedId) params.set('file', selectedId)
    if (query) params.set('q', query)
    const next = params.toString()
    window.history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search)
  }, [selectedId, query])

  const ingest = useCallback(
    (loaded: { rootName: string; files: { path: string; name: string; ext: Ext; text: string }[]; configs?: Parameters<typeof analyze>[2] }) => {
      if (loaded.files.length === 0) {
        setError('No .js/.jsx/.ts/.tsx files found in the selected folder.')
        return
      }
      return runAnalysis(loaded.rootName, loaded.files, loaded.configs ?? [])
        .then((result) => {
          setAnalysis(result)
          setSelectedId(null)
          setTraceCycle(null)
          setError(null)
          setLoading(false)
          setProgress(null)
          const deep = parseHash().file
          if (deep && result.files.some((f) => f.id === deep)) setSelectedId(deep)
        })
        .catch((e) => {
          console.error(e)
          setError(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`)
          setLoading(false)
          setProgress(null)
        })
    },
    [],
  )

  const pickFolder = useCallback(async () => {
    setLoading(true)
    setError(null)
    setProgress('Reading directoryâ€¦')
    try {
      const loaded = await pickRepoViaFsAccess((n) => setProgress(`Reading filesâ€¦ ${n}`))
      if (loaded) ingest(loaded)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // user cancelled the picker
      } else {
        console.error(e)
        setError('Could not read the selected folder.')
      }
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [ingest])

  const onDirInput = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setLoading(true)
      setError(null)
      setProgress('Reading filesâ€¦')
      try {
        ingest(await readFilesFromInput(files))
      } catch (e) {
        console.error(e)
        setError('Could not read the selected files.')
      } finally {
        setLoading(false)
        setProgress(null)
      }
    },
    [ingest],
  )

  // drag & drop folder support (Chromium picks up directory DnD)
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const items = e.dataTransfer?.items
      if (!items) return
      const handle = (w: any) => w.getAsFileSystemHandle?.() ?? null
      const entry = items[0] && handle(items[0])
      if (!entry || entry.kind !== 'directory') {
        setError('Drop a folder to analyze.')
        return
      }
      setLoading(true)
      setProgress(`Reading ${entry.name}â€¦`)
      try {
        const { readRepoFromHandle } = await import('./lib/fsAccessDrop')
        const loaded = await readRepoFromHandle(entry)
        ingest(loaded)
      } catch (err) {
        console.error(err)
        setError('Could not read the dropped folder.')
      } finally {
        setLoading(false)
        setProgress(null)
      }
    },
    [ingest],
  )

  const toggleExt = useCallback((ext: Ext) => {
    setEnabledExts((prev) => {
      const next = new Set(prev)
      if (next.has(ext)) next.delete(ext)
      else next.add(ext)
      return next
    })
  }, [])

  const toggleKind = useCallback((kind: DepKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }, [])

  const visibleIds = useMemo(() => {
    const ids = new Set<string>()
    if (!analysis) return ids
    const q = query.trim().toLowerCase()
    for (const f of analysis.files) {
      if (!enabledExts.has(f.ext)) continue
      if (problemsOnly && f.problems.length === 0) continue
      if (q && !f.path.toLowerCase().includes(q)) continue
      ids.add(f.id)
    }
    return ids
  }, [analysis, enabledExts, problemsOnly, query])

  const selectedFile = useMemo(() => analysis?.files.find((f) => f.id === selectedId) ?? null, [analysis, selectedId])

  const paletteCommands = useMemo<Command[]>(() => {
    if (!analysis) return []
    const layouts: LayoutMode[] = ['force', 'TD', 'BU', 'LR', 'RL', 'radialout']
    const colors: ColorMode[] = ['ext', 'cycle', 'problems', 'fanin', 'instability']
    const cmds: Command[] = [
      ...layouts.map<Command>((l) => ({ id: `layout-${l}`, label: `Layout: ${l}`, hint: 'graph', run: () => setLayout(l) })),
      ...colors.map<Command>((c) => ({ id: `color-${c}`, label: `Color: ${c}`, hint: 'graph', run: () => setColorMode(c) })),
      { id: 'export', label: 'Export report', hint: 'report', run: () => setReportOpen(true) },
      { id: 'save', label: 'Save scan snapshot', hint: 'snapshot', run: async () => { await saveScan({ id: uuid(), rootName: analysis.rootName, savedAt: Date.now(), analysis }); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1600) } },
      { id: 'compare', label: 'Compare with snapshot', hint: 'snapshot', run: () => setCompareOpen(true) },
      { id: 'ego1', label: 'Focus neighbours (1°)', hint: 'graph', run: () => setEgoDepth(1) },
      { id: 'ego2', label: 'Focus neighbours (2°)', hint: 'graph', run: () => setEgoDepth(2) },
      { id: 'ego-off', label: 'Focus off (whole graph)', hint: 'graph', run: () => setEgoDepth(0) },
      { id: 'labels', label: 'Toggle node labels', hint: 'graph', run: () => setShowLabels((v) => !v) },
      { id: 'problems-only', label: 'Toggle problems-only filter', hint: 'filter', run: () => setProblemsOnly((v) => !v) },
      { id: 'clear-filters', label: 'Clear filters & trace', hint: 'filter', run: () => { setQuery(''); setEnabledExts(new Set(ALL_EXTS)); setEnabledKinds(new Set(ALL_KINDS)); setProblemsOnly(false); setTraceCycle(null) } },
      { id: 'first-cycle', label: 'Trace first cycle', hint: 'cycle', run: () => setTraceCycle(analysis.cycles[0] ?? null) },
      { id: 'new-repo', label: 'Load another repo', hint: 'repo', run: () => { setAnalysis(null); setError(null) } },
    ]
    return cmds
  }, [analysis])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[type="search"]')
        input?.focus()
        input?.select()
      } else if (e.key === 'Escape') {
        if (reportOpen) setReportOpen(false)
        else if (paletteOpen) setPaletteOpen(false)
        else if (typing) (target as HTMLInputElement).blur()
        else setSelectedId(null)
      } else if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reportOpen, paletteOpen])

  if (!analysis) {
    return (
      <main
        className={`landing${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="landing-card">
          <div className="logo">
            <span className="logo-mark">â—‰</span>
            <h1>Repo X-Ray</h1>
          </div>
          <p className="lede">
            Scan any local JavaScript or TypeScript repository for imports, dynamic
            imports, <code>require()</code> calls, aliased imports, unresolved
            dependencies and circular dependencies â€” then explore them in an
            interactive dependency graph. Everything runs in your browser; no files
            ever leave your machine.
          </p>
          <div className="landing-actions">
            {fsAccessSupported() && (
              <button type="button" className="primary" onClick={pickFolder} disabled={loading}>
                {loading ? (progress ?? 'Scanningâ€¦') : 'Select repository folder'}
              </button>
            )}
            <button type="button" onClick={() => dirInputRef.current?.click()} disabled={loading} className={fsAccessSupported() ? 'ghost' : ''}>
              Select folder (compat)
            </button>
            <input
              ref={dirInputRef}
              type="file"
              multiple
              hidden
              // @ts-expect-error non-standard directory attribute
              webkitdirectory="true"
              directory=""
              onChange={(e) => onDirInput(e.target.files)}
            />
          </div>
          {error && <p className="error">{error}</p>}
          {loading && <div className="progress"><div className="progress-bar" /></div>}
          <ul className="landing-notes">
            <li>Analyzes <b>.js .jsx .ts .tsx</b></li>
            <li><b>tsconfig/vite aliases</b> resolved</li>
            <li><b>Circular deps</b> &amp; unresolved imports flagged</li>
            <li>JSON / DOT / Mermaid / Markdown export</li>
            <li>Drag &amp; drop a folder</li>
          </ul>
          {!fsAccessSupported() && (
            <p className="muted small">
              Your browser doesnâ€™t support direct folder picking â€” use Chrome or Edge for the
              native picker, or drop a folder onto this page.
            </p>
          )}
        </div>
      </main>
    )
  }

  const s = analysis.stats
  return (
    <div className="workbench">
      <header className="topbar">
        <div className="brand">
          <span className="logo-mark">â—‰</span>
          <h1>Repo X-Ray</h1>
        </div>
        <span className="root-name" title={analysis.rootName}>{analysis.rootName}</span>
        <ul className="mini-stats">
          <li><b>{s.files}</b> files</li>
          <li><b>{s.edges}</b> edges</li>
          <li><b className={s.cycles ? 'bad' : ''}>{s.cycles}</b> cycles</li>
          <li><b className="warn">{s.unresolved}</b> unresolved</li>
          <li><b>{(s.loc / 1000).toFixed(1)}k</b> LOC</li>
          {s.aliasedEdges > 0 && <li><b>{s.aliasedEdges}</b> aliased</li>}
          <li><b>{s.scannedMs}ms</b></li>
        </ul>
        <div className="topbar-actions">
          <button
            className="palette-trigger"
            type="button"
            onClick={() => setPaletteOpen(true)}
            title="Command palette (Ctrl+K)"
          >
            ⌘K
          </button>
          <button
            type="button"
            onClick={async () => {
              await saveScan({ id: uuid(), rootName: analysis.rootName, savedAt: Date.now(), analysis })
              setSavedFlash(true)
              setTimeout(() => setSavedFlash(false), 1600)
            }}
          >
            {savedFlash ? 'Saved ✓' : 'Save scan'}
          </button>
          <button
            type="button"
            disabled={!compareWith}
            title={compareWith ? 'Compare current repo with selected snapshot' : 'Pick a snapshot in the Snapshots tab first'}
            onClick={() => setCompareOpen(true)}
          >
            Compare
          </button>
          <button type="button" onClick={() => { setAnalysis(null); setError(null) }}>New repo</button>
          <button type="button" className="primary" onClick={() => setReportOpen(true)}>Export report</button>
        </div>
      </header>
      <Sidebar
        analysis={analysis}
        query={query}
        onQuery={setQuery}
        enabledExts={enabledExts}
        onToggleExt={toggleExt}
        problemsOnly={problemsOnly}
        onProblemsOnly={setProblemsOnly}
        enabledKinds={enabledKinds}
        onToggleKind={toggleKind}
        selectedId={selectedId}
        onSelect={(id) => { setSelectedId(id); setTraceCycle(null) }}
        onTraceCycle={setTraceCycle}
        tracedCycle={traceCycle}
        snapshotsTab={
          <SnapshotsPanel
            currentRoot={analysis.rootName}
            onLoad={(a) => { setAnalysis(a); setSelectedId(null); setTraceCycle(null) }}
            compareId={compareWith?.id ?? null}
            onCompareSelect={setCompareWith}
          />
        }
      />
      <main className="stage">
        <GraphControls
          layout={layout}
          onLayout={setLayout}
          colorMode={colorMode}
          onColorMode={setColorMode}
          edgeKinds={enabledKinds}
          onToggleKind={toggleKind}
          egoDepth={egoDepth}
          onEgoDepth={setEgoDepth}
          showLabels={showLabels}
          onShowLabels={setShowLabels}
          onReset={() => setResetKey((k) => k + 1)}
        />
        <GraphView
          key={resetKey}
          analysis={analysis}
          visibleIds={visibleIds}
          selectedId={selectedId}
          query={query}
          colorMode={colorMode}
          layout={layout}
          edgeKinds={enabledKinds}
          egoDepth={egoDepth}
          showLabels={showLabels}
          traceCycle={traceCycle}
          onSelect={setSelectedId}
        />
      </main>
      <DetailsPanel file={selectedFile} onSelect={setSelectedId} />
      {reportOpen && <ReportDialog analysis={analysis} onClose={() => setReportOpen(false)} />}
      {compareOpen && compareWith && (
        <CompareDialog before={compareWith.analysis} after={analysis} onClose={() => setCompareOpen(false)} />
      )}
      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          files={analysis.files}
          onPickFile={(id) => { setSelectedId(id); setTraceCycle(null) }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  )
}
