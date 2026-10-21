import { describe, expect, it } from 'vitest'
import { parseImports } from '../src/lib/parser'
import { analyze } from '../src/lib/analyze'
import type { RawFile } from '../src/lib/types'

function f(path: string, text: string): RawFile {
  const name = path.split('/').pop()!
  const ext = name.endsWith('.tsx') ? 'tsx' : name.endsWith('.ts') ? 'ts' : 'js'
  return { path, name, ext, text } as RawFile
}

describe('comment handling', () => {
  it('ignores an import mentioned in a trailing comment', () => {
    const refs = parseImports("const a = 1; // TODO: import x from './ghost'")
    expect(refs.map((r) => r.specifier)).toEqual([])
  })

  it('ignores imports mentioned in block and whole-line comments', () => {
    const refs = parseImports(
      ["/* import y from './block' */", "// import z from './line'", "import real from './real'"].join('\n'),
    )
    expect(refs.map((r) => r.specifier)).toEqual(['./real'])
  })

  it('keeps a URL inside a string literal intact', () => {
    const refs = parseImports("import x from 'https://cdn.example.com/x.js'")
    expect(refs.map((r) => r.specifier)).toEqual(['https://cdn.example.com/x.js'])
  })

  it('keeps a // inside a string literal intact', () => {
    const refs = parseImports("import x from 'https://example.com/a//b'")
    expect(refs.map((r) => r.specifier)).toEqual(['https://example.com/a//b'])
  })

  it('does not create a phantom edge for a commented-out import', () => {
    const files = [f('a.ts', "const a = 1; // import x from './ghost'")]
    const a = analyze(files, 'repo')
    expect(a.edges).toHaveLength(0)
    expect(a.files[0].problems).toHaveLength(0)
    expect(a.stats.unresolved).toBe(0)
  })

  it('still reports the line number of a real import after a comment', () => {
    const refs = parseImports(
      ["// a comment", "const a = 1; // trailing", "import real from './real'"].join('\n'),
    )
    expect(refs).toHaveLength(1)
    expect(refs[0]!.specifier).toBe('./real')
    expect(refs[0]!.line).toBe(3)
  })
})
