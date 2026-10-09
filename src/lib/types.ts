export type Ext = 'js' | 'jsx' | 'ts' | 'tsx'
export type DepKind = 'esm' | 'dynamic' | 'require' | 'type'

export interface ImportRef {
  specifier: string
  kind: DepKind
  line: number
  relative: boolean
  /** resolved absolute-ish path (relative to repo root), null when external or unresolved */
  resolved: string | null
  /** true when specifier is relative/aliased but cannot be resolved to a scanned file */
  unresolved: boolean
  /** true when specifier points outside the JS/TS set (css, svg, json…) */
  external: boolean
  /** alias used to resolve (e.g. "@/*") when applicable */
  viaAlias?: string
  /** true for `export … from` re-exports */
  reexport?: boolean
}

export interface FileInfo {
  id: string // repo-relative posix path, used as node id
  name: string
  path: string
  ext: Ext
  loc: number
  imports: ImportRef[]
  importedBy: string[] // ids of files that import this one
  problems: string[]
  inCycle: boolean
  isEntry: boolean
  fanIn: number
  fanOut: number
  instability: number // fanOut / (fanIn + fanOut), 0 when isolated
}

export interface GraphEdge {
  source: string
  target: string
  kind: DepKind
  inCycle: boolean
}

export interface Metrics {
  fanInTop: { path: string; fanIn: number }[]
  fanOutTop: { path: string; fanOut: number }[]
  mostUnstable: { path: string; instability: number }[]
  orphans: string[] // never imported, imports nothing
  entryPoints: string[]
  directoryCoupling: { a: string; b: string; count: number }[]
  deepestChains: string[][]
  depIssues: DepIssue[]
  depCount: number
}

export interface PackageInfo {
  name: string // "utils" or "@scope/utils"
  dir: string // "packages/utils" or "." for root
  fileCount: number
  dependsOn: string[] // package dirs imported by this package's files
}

export interface DepIssue {
  name: string
  spec: string
  kind: 'prod' | 'dev' | 'peer' | 'optional'
  declaredIn: string
  level: 'warn' | 'info'
  message: string
}

export interface Analysis {
  rootName: string
  files: FileInfo[]
  edges: GraphEdge[]
  cycles: string[][] // each cycle is a list of file ids
  aliases: { pattern: string; target: string }[]
  packages: PackageInfo[]
  metrics: Metrics
  stats: {
    files: number
    edges: number
    cycles: number
    unresolved: number
    external: number
    aliasedEdges: number
    byExt: Record<Ext, number>
    byKind: Record<DepKind, number>
    loc: number
    scannedMs: number
    engine: 'regex' | 'typescript-ast'
  }
}

/** A JS/TS source file read from disk. */
export interface RawFile {
  path: string // repo-relative posix path
  name: string
  ext: Ext
  text: string
}

/** Config files collected during the walk (tsconfig/jsconfig/package.json). */
export interface ConfigFile {
  path: string
  json: Record<string, unknown> | null
  text: string
}
