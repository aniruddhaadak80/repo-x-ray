import type { ConfigFile, Ext, RawFile } from './types'

const EXTS: Ext[] = ['js', 'jsx', 'ts', 'tsx']
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.cache', '.turbo', '.svelte-kit', '.output', '.vercel', '.netlify'])
const CONFIG_FILE_RE = /^(tsconfig\.[\w.]*|jsconfig\.[\w.]*|package)\.json$|(vite|webpack|rollup|next|nuxt)\.config\.[jt]s$/
const ANY_DEPTH_CONFIG_RE = /^(package\.json|pnpm-workspace\.ya?ml|lerna\.json|turbo\.json|nx\.json)$/
const MAX_BYTES = 2 * 1024 * 1024
const MAX_JSON_BYTES = 512 * 1024

export interface LoadedRepo {
  rootName: string
  files: RawFile[]
  configs: ConfigFile[]
}

function extOf(name: string): Ext | null {
  const lower = name.toLowerCase()
  for (const e of EXTS) if (lower.endsWith(`.${e}`)) return e
  return null
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** True if the app can use the File System Access API (directory picker). */
export function fsAccessSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

type DirHandle = { kind: 'directory'; name: string; values: () => AsyncIterable<FileSystemHandle> }
type FileHandle = { kind: 'file'; name: string; getFile: () => Promise<File> }

/** Pick a directory and read all JS/TS files into RawFile entries. */
export async function pickRepoViaFsAccess(onProgress?: (n: number) => void): Promise<LoadedRepo | null> {
  const picker = (window as unknown as { showDirectoryPicker: () => Promise<DirHandle> }).showDirectoryPicker
  const handle = await picker()
  const files: RawFile[] = []
  const configs: ConfigFile[] = []
  await walkFsHandle(handle, '', files, configs, onProgress)
  return { rootName: handle.name, files, configs }
}

async function walkFsHandle(
  dir: DirHandle,
  prefix: string,
  files: RawFile[],
  configs: ConfigFile[],
  onProgress?: (n: number) => void,
): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(entry.name)) continue
      await walkFsHandle(entry as unknown as DirHandle, `${prefix}${entry.name}/`, files, configs, onProgress)
    } else {
      const fh = entry as unknown as FileHandle
      const ext = extOf(fh.name)
      const isConfig = prefix === '' && CONFIG_FILE_RE.test(fh.name)
      const isWorkspaceConfig = ANY_DEPTH_CONFIG_RE.test(fh.name)
      if (!ext && !isConfig && !isWorkspaceConfig) continue
      const file = await fh.getFile()
      if (file.size > (isConfig || isWorkspaceConfig ? MAX_JSON_BYTES : MAX_BYTES)) continue
      const text = await file.text()
      const path = `${prefix}${file.name}`
      if (ext) files.push({ path, name: file.name, ext, text })
      if (isConfig || isWorkspaceConfig) configs.push(readConfig(path, text))
      onProgress?.(files.length + configs.length)
    }
  }
}

/** Fallback: read files selected through <input type="file" webkitdirectory>. */
export async function readFilesFromInput(fileList: FileList): Promise<LoadedRepo> {
  const files: RawFile[] = []
  const configs: ConfigFile[] = []
  const first = fileList[0]
  const rootName = first?.webkitRelativePath?.split('/')[0] ?? 'repo'
  for (const file of Array.from(fileList)) {
    const rel = file.webkitRelativePath // "<root>/a/b/c.ts"
    const segs = toPosix(rel).split('/')
    const isConfig = segs.length === 2 && CONFIG_FILE_RE.test(file.name)
    const isWorkspaceConfig = ANY_DEPTH_CONFIG_RE.test(file.name)
    const ext = extOf(file.name)
    if (!ext && !isConfig && !isWorkspaceConfig) continue
    if (segs.slice(1, -1).some((s) => SKIP_DIRS.has(s))) continue
    if (file.size > (isConfig ? MAX_JSON_BYTES : MAX_BYTES)) continue
    const text = await file.text()
    const path = segs.slice(1).join('/')
    if (ext) files.push({ path, name: file.name, ext, text })
    if (isConfig || isWorkspaceConfig) configs.push(readConfig(path, text))
  }
  return { rootName, files, configs }
}

function readConfig(path: string, text: string): ConfigFile {
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
