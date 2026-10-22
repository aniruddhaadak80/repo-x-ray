import { describe, expect, it } from 'vitest'
import { analyze } from '../src/lib/analyze'
import { suggestionsFor } from '../src/lib/fixes'
import type { RawFile } from '../src/lib/types'

function f(path: string, text: string): RawFile {
  const name = path.split('/').pop()!
  const ext = name.endsWith('.tsx') ? 'tsx' : name.endsWith('.ts') ? 'ts' : 'js'
  return { path, name, ext, text } as RawFile
}

describe('unresolvable path aliases', () => {
  const files = [
    f('src/main.ts', "import { B } from '@/components/Button'"),
    f('src/components/Other.ts', 'export const O = 1'),
  ]

  it('reports an @/ import that does not resolve as unresolved, not external', () => {
    const a = analyze(files, 'app', [])
    expect(a.stats.unresolved).toBe(1)
    expect(a.stats.external).toBe(0)
    expect(a.files[0]!.imports[0]!.unresolved).toBe(true)
    expect(a.files[0]!.imports[0]!.external).toBe(false)
  })

  it('flags it on the file', () => {
    const a = analyze(files, 'app', [])
    expect(a.files[0]!.problems.some((p) => p.includes('Unresolved import'))).toBe(true)
  })

  it('offers the alias hint for it', () => {
    const a = analyze(files, 'app', [])
    const suggestions = suggestionsFor(a.files[0]!, a)
    expect(suggestions.some((s) => s.title === 'Check your tsconfig/vite aliases')).toBe(true)
  })

  it('still resolves an @/ import that the alias table covers', () => {
    const ok = [
      f('src/main.ts', "import { B } from '@/components/Button'"),
      f('src/components/Button.ts', 'export const B = 1'),
    ]
    const a = analyze(ok, 'app', [
      { path: 'tsconfig.json', json: { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }, text: '' },
    ])
    expect(a.stats.aliasedEdges).toBe(1)
    expect(a.stats.unresolved).toBe(0)
    expect(a.stats.external).toBe(0)
  })

  it('still treats a scoped npm package as external', () => {
    const scoped = [f('src/main.ts', "import { x } from '@scope/pkg'")]
    const a = analyze(scoped, 'app', [])
    expect(a.stats.external).toBe(1)
    expect(a.stats.unresolved).toBe(0)
  })
})
