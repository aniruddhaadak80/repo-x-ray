import { useCallback, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { Analysis, DepKind, Ext, FileInfo } from '../lib/types'

export type ColorMode = 'ext' | 'cycle' | 'problems' | 'fanin' | 'instability'
export type LayoutMode = 'force' | 'TD' | 'BU' | 'LR' | 'RL' | 'radialout'

interface Props {
  analysis: Analysis
  visibleIds: Set<string>
  selectedId: string | null
  query: string
  colorMode: ColorMode
  layout: LayoutMode
  edgeKinds: Set<DepKind>
  egoDepth: number // 0 = off, 1 | 2
  showLabels: boolean
  traceCycle: string[] | null
  onSelect: (id: string) => void
}

interface GNode extends FileInfo {
  problemCount: number
}

const EXT_COLOR: Record<Ext, string> = {
  ts: '#3b82f6',
  tsx: '#06b6d4',
  js: '#eab308',
  jsx: '#f97316',
}
const CYCLE_COLOR = '#ef4444'
const SELECTED = '#ffffff'
const MAX_NODES = 1500 // keep force layout responsive on huge repos

function heat(t: number): string {
  // 0 â†’ blue, 0.5 â†’ green, 1 â†’ red
  const stops = [ '#38bdf8', '#34d399', '#fbbf24', '#f87171' ]
  const i = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)))
  const f = Math.min(1, Math.max(0, t * (stops.length - 1) - i))
  return mixHex(stops[i], stops[i + 1], f)
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `#${p.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const dagModeFor = (layout: LayoutMode) => (layout === 'force' ? undefined : (layout.toLowerCase() as 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin'))

export default function GraphView({
  analysis, visibleIds, selectedId, query, colorMode, layout, edgeKinds, egoDepth, showLabels, traceCycle, onSelect,
}: Props) {
  const fgRef = useRef<any>(null)
  const [hovered, setHovered] = useState<{ label: string; x: number; y: number } | null>(null)

  // ---------- node universe after filters ----------
  const filteredFiles = useMemo(
    () => analysis.files.filter((f) => visibleIds.has(f.id)),
    [analysis.files, visibleIds],
  )

  // ---------- ego neighborhood ----------
  const egoSet = useMemo(() => {
    if (!selectedId || egoDepth === 0) return null
    const set = new Set<string>([selectedId])
    let frontier = [selectedId]
    for (let d = 0; d < egoDepth; d++) {
      const next: string[] = []
      for (const id of frontier) {
        for (const e of analysis.edges) {
          if (e.source === id && !set.has(e.target)) { set.add(e.target); next.push(e.target) }
          if (e.target === id && !set.has(e.source)) { set.add(e.source); next.push(e.source) }
        }
      }
      frontier = next
    }
    return set
  }, [selectedId, egoDepth, analysis.edges])

  const traceSet = useMemo(() => (traceCycle ? new Set(traceCycle) : null), [traceCycle])

  // ---------- final node/edge sets ----------
  const { nodes, links } = useMemo(() => {
    let cols: GNode[] = filteredFiles.map((f) => ({ ...f, problemCount: f.problems.length }))
    const sets = [traceSet, egoSet].filter(Boolean) as Set<string>[]
    if (sets.length) cols = cols.filter((n) => sets.every((s) => s.has(n.id)))
    // cap by importance (degree) for perf
    let kept = cols
    if (cols.length > MAX_NODES) {
      kept = [...cols]
        .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))
        .slice(0, MAX_NODES)
    }
    const inVisible = new Set(kept.map((n) => n.id))
    const lk = analysis.edges.filter((e) => inVisible.has(e.source) && inVisible.has(e.target) && edgeKinds.has(e.kind))
    return { nodes: kept, links: lk }
  }, [filteredFiles, analysis.edges, traceSet, egoSet, edgeKinds])

  const queryMatches = useMemo(
    () => new Set(analysis.files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).map((f) => f.id)),
    [analysis, query],
  )

  const maxFanIn = useMemo(
    () => Math.max(1, ...filteredFiles.map((f) => f.fanIn)),
    [filteredFiles],
  )

  const colorFor = useCallback((n: GNode): string => {
    if (n.id === selectedId) return SELECTED
    switch (colorMode) {
      case 'ext':
        return EXT_COLOR[n.ext]
      case 'cycle':
        return n.inCycle ? CYCLE_COLOR : '#475569'
      case 'problems':
        return n.problemCount === 0 ? '#475569' : n.problemCount === 1 ? '#fbbf24' : CYCLE_COLOR
      case 'fanin':
        return heat(n.fanIn / maxFanIn)
      case 'instability':
        return heat(n.instability)
    }
  }, [colorMode, selectedId, maxFanIn])

  if (nodes.length === 0) {
    return <div className="graph-empty">No files match the current filters.</div>
  }

  return (
    <div className="graph-wrap">
      <ForceGraph2D
        key={layout}
        ref={fgRef}
        graphData={{ nodes: [...nodes], links: links.map((l) => ({ ...l })) }}
        nodeId="id"
        nodeVal={(n: any) => Math.max(3, Math.min(26, Math.sqrt(n.loc) * 1.5 + n.problemCount * 2 + n.fanIn * 0.5))}
        nodeColor={(n: any) => colorFor(n as GNode)}
        nodeLabel={(n: any) => `${n.name} â€” ${n.loc} LOC · ${n.fanIn} in / ${n.fanOut} out`}
        linkColor={(l: any) => {
          if (l.inCycle) return CYCLE_COLOR
          if (selectedId && (l.source.id === selectedId || l.target.id === selectedId)) return '#94a3b8'
          return '#334155'
        }}
        linkWidth={(l: any) =>
          l.inCycle ? 2.2 : selectedId && (l.source.id === selectedId || l.target.id === selectedId) ? 2 : 1
        }
        linkLineDash={(l: any) => (l.kind === 'dynamic' || l.kind === 'require' ? [3, 2] : null) as any}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.14}
        dagMode={dagModeFor(layout)}
        dagLevelDistance={layout === 'force' ? undefined : 60}
        backgroundColor="#0b0e14"
        enableNodeDrag
        cooldownTicks={layout === 'force' ? 140 : 40}
        onEngineStop={() => fgRef.current?.zoomToFit?.(600, 60)}
        onNodeHover={(n: any) => {
          setHovered(
            n ? { label: `${n.name} â€” ${n.loc} LOC · ${n.fanIn} in / ${n.fanOut} out${n.problemCount ? ` · ${n.problemCount} problem(s)` : ''}`, x: n.x, y: n.y } : null,
          )
        }}
        nodeCanvasObjectMode={(n: any) => {
          const label = showLabels || n.id === selectedId || (query && queryMatches.has(n.id))
          if (!label) return undefined
          return 'replace'
        }}
        nodeCanvasObject={(n: any, ctx: any) => {
          const size = Math.max(4, Math.min(16, Math.sqrt(n.loc) * 1.3 + (n.problemCount ? 3 : 0)))
          ctx.beginPath()
          ctx.arc(n.x, n.y, size, 0, 2 * Math.PI, false)
          ctx.fillStyle = colorFor(n as GNode)
          ctx.fill()
          if (n.problemCount) {
            ctx.lineWidth = 2
            ctx.strokeStyle = CYCLE_COLOR
            ctx.stroke()
          }
          if (n.id === selectedId) {
            ctx.lineWidth = 2.5
            ctx.strokeStyle = '#38bdf8'
            ctx.beginPath()
            ctx.arc(n.x, n.y, size + 4, 0, 2 * Math.PI, false)
            ctx.stroke()
          }
          const drawLabel = showLabels || n.id === selectedId || (query && queryMatches.has(n.id))
          if (!drawLabel) return
          const label = n.name as string
          ctx.font = `${n.id === selectedId ? 'bold ' : ''}11px Inter, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = query && queryMatches.has(n.id) ? '#f8fafc' : '#cbd5e1'
          ctx.fillText(label, n.x, n.y + size + 3)
        }}
        onNodeClick={(n: any) => {
          onSelect(n.id)
          fgRef.current?.centerAt(n.x, n.y, 500)
        }}
        onNodeDragEnd={(n: any) => {
          n.fx = n.x
          n.fy = n.y
        }}
      />
      {hovered && <div className="graph-tooltip">{hovered.label}</div>}
      <GraphLegend colorMode={colorMode} />
      {nodes.length === MAX_NODES && (
        <div className="graph-notice">Showing top {MAX_NODES} of {filteredFiles.length} matched files (ranked by degree)</div>
      )}
    </div>
  )
}

function GraphLegend({ colorMode }: { colorMode: ColorMode }) {
  if (colorMode === 'ext') {
    return (
      <div className="graph-legend">
        <span><i style={{ background: EXT_COLOR.ts }} />.ts</span>
        <span><i style={{ background: EXT_COLOR.tsx }} />.tsx</span>
        <span><i style={{ background: EXT_COLOR.js }} />.js</span>
        <span><i style={{ background: EXT_COLOR.jsx }} />.jsx</span>
        <span><i className="ring" />problems</span>
      </div>
    )
  }
  return (
    <div className="graph-legend">
      <span className="muted">low</span>
      <span className="heat" style={{ background: `linear-gradient(90deg, ${heat(0)}, ${heat(0.5)}, ${heat(1)})` }} />
      <span className="muted">high â€” {colorMode === 'cycle' ? 'in cycle' : colorMode === 'problems' ? 'problem count' : colorMode === 'fanin' ? 'fan-in' : 'instability'}</span>
    </div>
  )
}

