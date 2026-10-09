import { describe, expect, it } from 'vitest'
import { suggestCycleBreak, suggestEsmFix, suggestUnresolvedFix, suggestionsFor } from '../src/lib/fixes'
import { analyze } from '../src/lib/analyze'
import type { RawFile } from '../src/lib/types'

function f(path: string, text: string): RawFile {
  const name = path.split('/').pop()!
  const ext = name.endsWith('.tsx') ? 'tsx' : name.endsWith('.jsx') ? 'jsx' : name.endsWith('.ts') ? 'ts' : 'js'
  return { path, name, ext, text } as RawFile
}

describe('fixes', () => {
  it('suggests a moved-file target for unresolved imports', () => {
    const analysis = analyze([f('src/main.ts', `import x from './botton'`), f('src/botton.ts', `export const x = 1`)], 'app')
    // fix the fixture: exact-name match test
    const analysis2 = analyze([f('src/main.ts', `import x from './button'`), f('src/Button.ts', `export const x = 1`)], 'app')
    const file = analysis2.files[0]
    const ref = file.imports[0]
    void analysis
    const s = suggestUnresolvedFix(ref, file, analysis2)
    expect(s.length).toBeGreaterThan(0)
    expect(s[0].target).toBe('src/Button.ts')
    expect(s[0].code).toContain('./Button')
  })

  it('suggests breaking a cycle via dynamic import', () => {
    const analysis = analyze([f('a.ts', `import './b'`), f('b.ts', `import './a'`)], 'app')
    const s = suggestCycleBreak(analysis.files[0], analysis)
    expect(s).toHaveLength(1)
    expect(s[0].title).toContain('Break the cycle')
    expect(s[0].code).toContain('await import')
  })

  it('suggests unifying require + esm', () => {
    const analysis = analyze([f('a.ts', `import x from './b'\nconst y = require('./c')`), f('b.ts', ``), f('c.ts', ``)], 'app')
    const s = suggestEsmFix(analysis.files[0])
    expect(s).toHaveLength(1)
    expect(s[0].code).toContain("+ import x from './c'")
  })

  it('aggregates suggestions for a file', () => {
    const analysis = analyze([f('a.ts', `import './b'`), f('b.ts', `import './a'`)], 'app')
    const s = suggestionsFor(analysis.files[0], analysis)
    expect(s.map((x) => x.id)).toContain('cycle:a.ts')
  })
})

describe('dependency audit', () => {
  it('flags floating ranges and git urls', () => {
    const files = [f('src/index.ts', `export const x = 1`)]
    const configs = [
      { path: 'package.json', json: { dependencies: { good: '^1.0.0', bad: '*', gitdep: 'github:user/repo', empty: '' } }, text: '' },
    ]
    const a = analyze(files, 'app', configs)
    const msgs = a.metrics.depIssues.map((i) => `${i.name}:${i.message}`)
    expect(msgs.some((m) => m.startsWith('bad:Floating'))).toBe(true)
    expect(msgs.some((m) => m.startsWith('gitdep:Git/URL'))).toBe(true)
    expect(msgs.some((m) => m.startsWith('empty:Empty'))).toBe(true)
    expect(a.metrics.depCount).toBe(4)
  })
})
