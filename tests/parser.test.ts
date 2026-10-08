import { describe, expect, it } from 'vitest'
import { parseImports } from '../src/lib/parser'

describe('parseImports', () => {
  it('detects ES imports', () => {
    const src = `import a from './a.ts'\nimport {b, c} from "./b"\n`
    const refs = parseImports(src)
    expect(refs.filter((r) => r.kind === 'esm' && r.specifier === './a.ts')).toHaveLength(1)
    expect(refs.find((r) => r.specifier === './b')?.relative).toBe(true)
  })

  it('detects re-exports as imports', () => {
    const refs = parseImports(`export {x} from './x'\n`)
    expect(refs).toHaveLength(1)
    expect(refs[0].specifier).toBe('./x')
  })

  it('detects dynamic imports', () => {
    const refs = parseImports(`const m = await import('./lazy.js')\n`)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('dynamic')
  })

  it('detects require()', () => {
    const refs = parseImports(`const x = require('pkg')\n`)
    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('require')
    expect(refs[0].relative).toBe(false)
  })

  it('tags type-only imports', () => {
    const refs = parseImports(`import type { A } from './a'\nimport { b } from './b'\n`)
    expect(refs).toHaveLength(2)
    expect(refs[0].kind).toBe('type')
    expect(refs[1].kind).toBe('esm')
  })

  it('ignores commented-out imports', () => {
    const refs = parseImports(`// import a from './a'\n/* import b from './b' */\nconst c = 1\n`)
    expect(refs).toHaveLength(0)
  })

  it('reports line numbers', () => {
    const refs = parseImports(`const x = 1\nimport y from './y'\n`)
    expect(refs[0].line).toBe(2)
  })
})
