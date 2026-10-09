/**
 * Benchmark the analyzer against a real repo with both engines.
 * Usage: bun run scripts/bench.ts <repoPath>
 */
import { readdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { analyze } from '../src/lib/analyze'
import { SKIP_DIRS, CONFIG_FILE_RE, ANY_DEPTH_CONFIG_RE, MAX_BYTES, MAX_JSON_BYTES, toConfigFile } from '../src/lib/fsInternals'
import type { ConfigFile, Ext, RawFile } from '../src/lib/types'

async function load(root: string): Promise<{ files: RawFile[]; configs: ConfigFile[] }> {
  const files: RawFile[] = []
  const configs: ConfigFile[] = []
  const walk = async (dir: string, prefix: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, `${prefix}${entry.name}/`)
        continue
      }
      const path = `${prefix}${entry.name}`
      const isRoot = prefix === ''
      const isConfig = (isRoot && CONFIG_FILE_RE.test(entry.name)) || ANY_DEPTH_CONFIG_RE.test(entry.name)
      const m = /\.(jsx|tsx|js|ts)$/.exec(entry.name)
      if (!m && !isConfig) continue
      const limit = isConfig ? MAX_JSON_BYTES : MAX_BYTES
      const text = await Bun.file(full).text()
      if (text.length > limit) continue
      if (isConfig) configs.push(toConfigFile(path, text))
      else if (m) files.push({ path, name: entry.name, ext: m[1] as Ext, text })
    }
  }
  await walk(root, '')
  return { files, configs }
}

const root = process.argv[2]
if (!root) {
  console.error('usage: bun run scripts/bench.ts <repoPath>')
  process.exit(1)
}

const t0 = Date.now()
const { files, configs } = await load(root)
const readMs = Date.now() - t0

// warm-up
analyze(files, 'warmup', configs)

const t1 = performance.now()
const rx = analyze(files, basename(root), configs, { mode: 'regex' })
const regexMs = Math.round(performance.now() - t1)

const t2 = performance.now()
const ast = analyze(files, basename(root), configs, { mode: 'ast', tsLib: (await import('typescript')) as never })
const astMs = Math.round(performance.now() - t2)

const totalBytes = files.reduce((n, f) => n + f.text.length, 0)
const mbps = (ms: number) => ((totalBytes / 1e6) / (ms / 1000)).toFixed(1)

console.log(`\nRepo: ${basename(root)}`)
console.log(`  files: ${files.length} (${(totalBytes / 1e6).toFixed(1)} MB source)   configs: ${configs.length}`)
console.log(`  read:  ${readMs}ms`)
console.log(`  regex: ${regexMs}ms  (${mbps(regexMs)} MB/s)   edges=${rx.stats.edges} cycles=${rx.stats.cycles} unresolved=${rx.stats.unresolved}`)
console.log(`  ast:   ${astMs}ms  (${mbps(astMs)} MB/s)   edges=${ast.stats.edges} cycles=${ast.stats.cycles} unresolved=${ast.stats.unresolved}`)
const px = new Set(rx.files.flatMap((f) => f.imports.filter((r) => r.resolved).map((r) => `${r.specifier}`)))
const pa = new Set(ast.files.flatMap((f) => f.imports.filter((r) => r.resolved).map((r) => `${r.specifier}`)))
console.log(`  specifier agreement: ${px.size} vs ${pa.size} (delta ${pa.size - px.size}; AST finds ones regex misses)`)
console.log(`  dep issues: ${ast.metrics.depIssues.length}, packages: ${ast.packages.length}, deepest chain: ${ast.metrics.deepestChains[0]?.length ?? 0}`)
console.log(`  ratio: regex is ${(astMs / regexMs).toFixed(1)}x faster than AST\n`)
