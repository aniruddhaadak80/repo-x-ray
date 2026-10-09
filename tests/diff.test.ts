import { describe, expect, it } from 'vitest'
import { diffScans } from '../src/lib/diff'
import { analyze } from '../src/lib/analyze'
import type { RawFile } from '../src/lib/types'

function f(path: string, text: string): RawFile {
  const name = path.split('/').pop()!
  const ext = name.endsWith('.tsx') ? 'tsx' : name.endsWith('.jsx') ? 'jsx' : name.endsWith('.ts') ? 'ts' : 'js'
  return { path, name, ext, text } as RawFile
}

describe('diffScans', () => {
  it('detects added/removed/changed files', () => {
    const a = analyze([f('a.ts', `import './b'`), f('b.ts', `export const b = 1`)], 'repo')
    const b = analyze([f('a.ts', `import './c'`), f('b.ts', `export const b = 1\n\nexport const c = 2`), f('c.ts', `export const c = 1`)], 'repo')
    const d = diffScans(a, b)
    expect(d.filesAdded).toEqual(['c.ts'])
    expect(d.filesRemoved).toEqual([])
    expect(d.filesChanged).toEqual(['b.ts'])
    expect(d.edgesAdded).toBeGreaterThan(0)
    expect(d.edgesRemoved).toBeGreaterThan(0)
  })

  it('tracks problem counts both directions', () => {
    const a = analyze([f('a.ts', `import './missing'`)], 'repo')
    const b = analyze([f('a.ts', `import './b'`), f('b.ts', ``)], 'repo')
    const d = diffScans(a, b)
    expect(d.problemsBefore).toBe(1)
    expect(d.problemsAfter).toBe(0)
    expect(d.fixedProblemFiles).toEqual(['a.ts'])
  })

  it('compares cycle counts', () => {
    const a = analyze([f('a.ts', ``), f('b.ts', ``)], 'repo')
    const b = analyze([f('a.ts', `import './b'`), f('b.ts', `import './a'`)], 'repo')
    const d = diffScans(a, b)
    expect(d.cyclesBefore).toBe(0)
    expect(d.cyclesAfter).toBe(1)
  })
})
