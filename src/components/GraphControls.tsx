import type { ColorMode, LayoutMode } from './GraphView'
import type { DepKind } from '../lib/types'

interface Props {
  layout: LayoutMode
  onLayout: (l: LayoutMode) => void
  colorMode: ColorMode
  onColorMode: (c: ColorMode) => void
  edgeKinds: Set<DepKind>
  onToggleKind: (k: DepKind) => void
  egoDepth: number
  onEgoDepth: (d: number) => void
  showLabels: boolean
  onShowLabels: (v: boolean) => void
  onReset: () => void
}

const LAYOUTS: { id: LayoutMode; label: string }[] = [
  { id: 'force', label: 'Force' },
  { id: 'TD', label: 'Tree ↓' },
  { id: 'BU', label: 'Tree ↑' },
  { id: 'LR', label: 'Tree →' },
  { id: 'RL', label: 'Tree ←' },
  { id: 'radialout', label: 'Radial' },
]

const COLORS: { id: ColorMode; label: string }[] = [
  { id: 'ext', label: 'Extension' },
  { id: 'cycle', label: 'Cycles' },
  { id: 'problems', label: 'Problems' },
  { id: 'fanin', label: 'Fan-in' },
  { id: 'instability', label: 'Instability' },
]

const KINDS: { id: DepKind; label: string }[] = [
  { id: 'esm', label: 'ESM' },
  { id: 'dynamic', label: 'dynamic' },
  { id: 'require', label: 'require' },
  { id: 'type', label: 'types' },
]

export default function GraphControls(props: Props) {
  const { layout, onLayout, colorMode, onColorMode, edgeKinds, onToggleKind, egoDepth, onEgoDepth, showLabels, onShowLabels, onReset } = props
  return (
    <div className="graph-controls">
      <div className="control-group">
        <span className="control-label">Layout</span>
        <div className="segmented small">
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button" className={layout === l.id ? 'active' : ''} onClick={() => onLayout(l.id)}>{l.label}</button>
          ))}
        </div>
      </div>
      <div className="control-group">
        <span className="control-label">Color</span>
        <div className="segmented small">
          {COLORS.map((c) => (
            <button key={c.id} type="button" className={colorMode === c.id ? 'active' : ''} onClick={() => onColorMode(c.id)}>{c.label}</button>
          ))}
        </div>
      </div>
      <div className="control-group">
        <span className="control-label">Edges</span>
        <div className="segmented small">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`${edgeKinds.has(k.id) ? 'active' : ''}`}
              aria-pressed={edgeKinds.has(k.id)}
              onClick={() => onToggleKind(k.id)}
            >{k.label}</button>
          ))}
        </div>
      </div>
      <div className="control-group">
        <span className="control-label">Focus</span>
        <div className="segmented small">
          {[0, 1, 2].map((d) => (
            <button key={d} type="button" className={egoDepth === d ? 'active' : ''} onClick={() => onEgoDepth(d)}>
              {d === 0 ? 'Off' : `${d}°`}
            </button>
          ))}
        </div>
      </div>
      <div className="control-group right">
        <label className="problems-toggle">
          <input type="checkbox" checked={showLabels} onChange={(e) => onShowLabels(e.target.checked)} />
          Labels
        </label>
        <button type="button" className="ghost small-btn" onClick={onReset}>Reset view</button>
      </div>
    </div>
  )
}
