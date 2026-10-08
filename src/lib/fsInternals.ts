import type { ConfigFile, Ext } from './types'

/** Directories never walked when scanning a repo. */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.next', '.cache', '.turbo', '.svelte-kit', '.output', '.vercel', '.netlify',
])

/** Analyzed source extensions, in probe order. */
export const EXTS: Ext[] = ['js', 'jsx', 'ts', 'tsx']

export const CONFIG_FILE_RE = /^(tsconfig\.[\w.]*|jsconfig\.[\w.]*|package)\.json$|(vite|webpack|rollup|next|nuxt)\.config\.[jt]s$/

export const MAX_BYTES = 2 * 1024 * 1024
export const MAX_JSON_BYTES = 512 * 1024

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Parse a config file payload into a ConfigFile (JSON parsed when possible). */
export function toConfigFile(path: string, text: string): ConfigFile {
  let json: Record<string, unknown> | null = null
  if (path.endsWith('.json')) {
    try {
      const parsed: unknown = JSON.parse(text)
      json = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      json = null
    }
  }
  return { path, json, text }
}
