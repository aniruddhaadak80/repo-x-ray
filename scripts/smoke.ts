/**
 * Smoke test: run the analyzer over a real local repo and print a summary.
 * Usage: bun run scripts/smoke.ts <repoPath>
 */
import { readdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { analyze } from '../src/lib/analyze'
import { SKIP_DIRS, CONFIG_FILE_RE, MAX_BYTES, toConfigFile } from '../src/lib/fsInternals'
import type { Ext, RawFile } from '../src/lib/types'

async function walk(dir: string, prefix: string, out: RawFile[], configs: { path: string; json: Record<string, unknown> | null; text: string }[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      // config dotfiles still walkable; skip only known skip dirs with dots
    }
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, `${prefix}${entry.name}/`, out, configs)
    } else {
      const path = `${prefix}${entry.name}`
      const isConfig = prefix === '' && CONFIG_FILE_RE.test(entry.name)
      const m = /\.(jsx|tsx|js|ts)$/.exec(entry.name)
      if (!m && !isConfig) continue
      const text = await Bun.file(full).text()
      if (isConfig) configs.push(toConfigFile(path, text))
      else if (m && text.length < MAX_BYTES) out.push({ path, name: entry.name, ext: m[1] as Ext, text })
    }
  }
}

const root = process.argv[2]
if (!root) {
  console.error('usage: bun run scripts/smoke.ts <repoPath>')
  process.exit(1)
}
const files: RawFile[] = []
const configs: { path: string; json: Record<string, unknown> | null; text: string }[] = []
await walk(root, '', files, configs)
const result = analyze(files, basename(root), configs)
const a = result as typeof result & { files: (typeof result)['files'] }
console.log(`${a.rootName}: files=${a.stats.files} edges=${a.stats.edges} cycles=${a.stats.cycles} unresolved=${a.stats.unresolved} aliased=${a.stats.aliasedEdges} ms=${a.stats.scannedMs} loc=${a.stats.loc}`)
console.log('  aliases detected:', a.aliases.length)
for (const c of a.cycles.slice(0, 6)) console.log('  cycle: ' + [...c, c[0]].join(' -> '))
console.log('  entry points:', a.metrics.entryPoints.slice(0, 4).join(', ') || 'none')
const top = a.metrics.fanInTop.slice(0, 3).map((m) => `${m.path}<-${m.fanIn}`).join('  ')
console.log('  fan-in top:', top)
console.log('  orphans:', a.metrics.orphans.length, ' deepest chain:', a.metrics.deepestChains[0]?.length ?? 0)
