import type { ConfigFile, Ext, RawFile } from './types'
import { SKIP_DIRS, EXTS, CONFIG_FILE_RE, MAX_BYTES, MAX_JSON_BYTES, toConfigFile, toPosix } from './fsInternals'

interface Entry {
  kind: 'file' | 'directory'
  name: string
  getFile?: () => Promise<File>
  values?: () => AsyncIterable<Entry>
}

/** Read a repo from a dropped FileSystemDirectoryHandle. */
export async function readRepoFromHandle(root: Entry): Promise<{ rootName: string; files: RawFile[]; configs: ConfigFile[] }> {
  const files: RawFile[] = []
  const configs: ConfigFile[] = []
  await walk(root, '', files, configs)
  return { rootName: root.name, files, configs }
}

async function walk(dir: Entry, prefix: string, files: RawFile[], configs: ConfigFile[]): Promise<void> {
  for await (const entry of dir.values!()) {
    const rel = toPosix(`${prefix}${entry.name}`)
    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(entry, `${prefix}${entry.name}/`, files, configs)
      continue
    }
    const lower = rel.toLowerCase()
    const ext = (EXTS as string[]).find((e) => lower.endsWith(`.${e}`)) as Ext | undefined
    const isConfig = rel.split('/').length === 1 && CONFIG_FILE_RE.test(entry.name)
    if (!ext && !isConfig) continue
    const file = await entry.getFile!()
    if (file.size > (isConfig ? MAX_JSON_BYTES : MAX_BYTES)) continue
    const path = rel
    const text = await file.text()
    if (ext) files.push({ path, name: entry.name, ext, text })
    if (isConfig) configs.push(toConfigFile(path, text))
  }
}
