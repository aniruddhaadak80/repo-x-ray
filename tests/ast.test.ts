import { describe, expect, it } from 'vitest'
import type ts from 'typescript'
import { parseImportsAst, parseImports } from '../src/lib/astParse'

const tsLib = (await import('typescript')) as unknown as typeof ts

describe('parseImportsAst', () => {
  it('matches the regex scanner on straightforward code', () => {
    const src = `import a from './a'\nimport { b } from "../b"\nexport { c } from './c'\nconst d = require('d')\nconst e = await import('./e')\nimport './side'`
    const ast = parseImportsAst(src, 'ts', tsLib)
    const rx = parseImports(src)
    const norm = (refs: { specifier: string; kind: string }[]) => refs.map((r) => `${r.kind}:${r.specifier}`).sort()
    expect(norm(ast)).toEqual(norm(rx))
  })

  it('detects multi-line imports', () => {
    const src = `import {\n  a,\n  b,\n} from './multi'\nimport defaultExport, {\n  c\n} from "./x"`
    const ast = parseImportsAst(src, 'ts', tsLib)
    expect(ast.map((r) => r.specifier)).toEqual(['./multi', './x'])
    expect(ast[0].line).toBe(4)
  })

  it('tags type-only imports', () => {
    const src = `import type { A } from './a'\nimport { b } from './b'\nimport type B from './b2'`
    const ast = parseImportsAst(src, 'ts', tsLib)
    expect(ast.filter((r) => r.kind === 'type')).toHaveLength(2)
    expect(ast.filter((r) => r.kind === 'esm')).toHaveLength(1)
  })

  it('detects export * from and export {} from as re-exports', () => {
    const src = `export * from './a'\nexport * as ns from './b'\nexport { x, y } from './c'`
    const ast = parseImportsAst(src, 'ts', tsLib)
    expect(ast).toHaveLength(3)
    expect(ast.every((r) => r.reexport)).toBe(true)
  })

  it('detects import = require()', () => {
    const src = `import fs = require('fs')\nimport x = require('./x')`
    const ast = parseImportsAst(src, 'ts', tsLib)
    expect(ast.filter((r) => r.kind === 'require')).toHaveLength(2)
  })

  it('ignores interpolated dynamic imports but marks them unresolvable', () => {
    const src = `const m = await import(\`./locales/\${lang}\`)\nconst n = await import('./static')`
    const ast = parseImportsAst(src, 'ts', tsLib)
    expect(ast).toHaveLength(2)
    const dyn = ast.find((r) => r.specifier === '<dynamic>')!
    expect(dyn.kind).toBe('dynamic')
    expect(dyn.external).toBe(true)
    expect(ast.find((r) => r.specifier === './static')).toBeTruthy()
  })

  it('does not treat strings inside code as imports (regex limitation, AST advantage)', () => {
    const src = `const s = "import fake from './nope'"\nconsole.log("require('also-nope')")`
    const rx = parseImports(src)
    const ast = parseImportsAst(src, 'ts', tsLib)
    expect(rx.length).toBeGreaterThan(0) // regex false positive
    expect(ast).toHaveLength(0) // AST is correct
  })

  it('parses jsx files', () => {
    const src = `import React from 'react'\nexport const C = () => <div className="x">hi</div>\nimport styles from './m.css'`
    const ast = parseImportsAst(src, 'tsx', tsLib)
    expect(ast.map((r) => r.specifier)).toEqual(['react', './m.css'])
  })
})
