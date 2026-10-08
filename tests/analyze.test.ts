import { describe, expect, it } from 'vitest'
import { analyze, extractAliases } from '../src/lib/analyze'
import { toDot, toMermaid, toMarkdown } from '../src/lib/export'
import type { ConfigFile, Ext, RawFile } from '../src/lib/types'

function f(path: string, text: string): RawFile {
  const name = path.split('/').pop()!
  const ext = name.endsWith('.tsx') ? 'tsx' : name.endsWith('.jsx') ? 'jsx' : name.endsWith('.ts') ? 'ts' : 'js'
  return { path, name, ext, text } as RawFile
}

function cfg(path: string, json: unknown): ConfigFile {
  return { path, json: json as Record<string, unknown>, text: '' }
}

describe('analyze', () => {
  it('resolves relative imports across extensions and builds edges', () => {
    const files = [
      f('src/App.ts', `import { helper } from './utils.js'\nimport L from './LazyButton'`),
      f('src/utils.js', `export const helper = 1`),
      f('src/LazyButton.tsx', `export default 1`),
    ]
    const a = analyze(files, 'repo')
    expect(a.stats.files).toBe(3)
    expect(a.stats.edges).toBe(2)
    expect(a.files[0].imports.every((r) => r.resolved !== null)).toBe(true)
  })

  it('flags unresolved relative imports', () => {
    const files = [f('src/index.ts', `import './missing'`)]
    const a = analyze(files, 'repo')
    expect(a.files[0].problems.some((p) => p.includes('Unresolved'))).toBe(true)
    expect(a.stats.unresolved).toBe(1)
  })

  it('detects cycles', () => {
    const files = [f('a.ts', `import './b'`), f('b.ts', `import './c'`), f('c.ts', `import './a'`)]
    const a = analyze(files, 'repo')
    expect(a.stats.cycles).toBe(1)
    expect(a.cycles[0]).toHaveLength(3)
    expect(a.files.every((file) => file.inCycle)).toBe(true)
    expect(a.edges.every((e) => e.inCycle)).toBe(true)
  })

  it('does not flag acyclic graphs', () => {
    const files = [f('a.ts', `import './b'`), f('b.ts', ``, )]
    const a = analyze(files, 'repo')
    expect(a.stats.cycles).toBe(0)
  })

  it('builds importedBy index', () => {
    const files = [f('a.ts', `import './b'`), f('b.ts', ``)]
    const a = analyze(files, 'repo')
    expect(a.files[1].importedBy).toContain('a.ts')
  })

  it('flags mixed require + esm', () => {
    const files = [f('a.ts', `import x from './b'\nconst y = require('./c')`), f('b.ts', ``), f('c.ts', ``)]
    const a = analyze(files, 'repo')
    expect(a.files[0].problems.some((p) => p.startsWith('Mixes'))).toBe(true)
  })

  it('ignores package imports (no edges)', () => {
    const files = [f('a.ts', `import React from 'react'`)]
    const a = analyze(files, 'repo')
    expect(a.edges).toHaveLength(0)
    expect(a.stats.cycles).toBe(0)
  })

  it('treats asset imports as external, not unresolved', () => {
    const files = [f('a.ts', `import './a.css'\nimport logo from './logo.svg'\nimport './b'`), f('b.ts', ``)]
    const a = analyze(files, 'repo')
    expect(a.stats.unresolved).toBe(0)
    expect(a.files[0].problems).toHaveLength(0)
  })
})

describe('alias resolution', () => {
  it('extracts tsconfig paths', () => {
    const aliases = extractAliases([cfg('tsconfig.json', { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } })])
    expect(aliases).toContainEqual({ pattern: '@', target: 'src' })
  })

  it('resolves aliased imports to real files', () => {
    const files = [f('src/main.ts', `import { B } from '@/components/Button'`), f('src/components/Button.ts', `export const B = 1`)]
    const a = analyze(files, 'app', [cfg('tsconfig.json', { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } })])
    expect(a.stats.aliasedEdges).toBe(1)
    expect(a.edges[0]).toMatchObject({ source: 'src/main.ts', target: 'src/components/Button.ts' })
    expect(a.files[0].imports[0].viaAlias).toBe('@')
  })

  it('keeps unknown specifiers external', () => {
    const files = [f('src/main.ts', `import lodash from 'lodash'`)]
    const a = analyze(files, 'app', [cfg('tsconfig.json', { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } })])
    expect(a.stats.aliasedEdges).toBe(0)
    expect(a.edges).toHaveLength(0)
  })
})

describe('metrics', () => {
  it('computes fan-in / instability / entry points', () => {
    const files = [
      f('src/index.ts', `import './a'\nimport './b'`),
      f('src/a.ts', `import './c'`),
      f('src/b.ts', `import './c'`),
      f('src/c.ts', ``),
    ]
    const a = analyze(files, 'app', [cfg('package.json', { main: 'src/index.ts' })])
    expect(a.files[0].fanOut).toBe(2)
    expect(a.files[3].fanIn).toBe(2)
    expect(a.files[0].instability).toBeCloseTo(2 / 2, 5)
    expect(a.metrics.entryPoints).toContain('src/index.ts')
    expect(a.files[0].isEntry).toBe(true)
  })

  it('finds deepest chains on a DAG', () => {
    const files = [f('a.ts', `import './b'`), f('b.ts', `import './c'`), f('c.ts', `import './d'`), f('d.ts', ``)]
    const a = analyze(files, 'app')
    expect(a.metrics.deepestChains[0]).toHaveLength(4)
  })
})

describe('exports', () => {
  const files = [f('src/a.ts', `import './b'`), f('src/b.ts', `import './a'`)]
  const a = analyze(files, 'demo')

  it('emits valid DOT', () => {
    const dot = toDot(a)
    expect(dot).toContain('digraph RepoXRay')
    expect(dot).toContain('"src/a.ts" -> "src/b.ts"')
    expect(dot.match(/"/g)!.length % 2).toBe(0)
  })

  it('emits Mermaid with class defs', () => {
    const mmd = toMermaid(a)
    expect(mmd.startsWith('graph LR')).toBe(true)
    expect(mmd).toContain('classDef cycle')
    expect(mmd.match(/:::/g).length).toBeGreaterThanOrEqual(a.files.length)
  })

  it('emits Markdown summary', () => {
    const md = toMarkdown(a)
    expect(md).toContain('# Repo X-Ray report')
    expect(md).toContain('Circular dependencies: **1**')
  })
})
