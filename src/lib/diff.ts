import type { Analysis } from './types'

export interface ScanDiff {
  filesAdded: string[]
  filesRemoved: string[]
  filesChanged: string[]
  edgesAdded: number
  edgesRemoved: number
  cyclesBefore: number
  cyclesAfter: number
  problemsBefore: number
  problemsAfter: number
  newProblemFiles: string[]
  fixedProblemFiles: string[]
}

/** Content-ish signature for a file inside a scan (loc + degree + problems). */
function signature(a: Analysis, path: string): string {
  const f = a.files.find((x) => x.path === path)
  if (!f) return 'missing'
  return `${f.loc}|${f.fanIn}|${f.fanOut}|${f.problems.length}`
}

/** Compare two scans (before → after). */
export function diffScans(before: Analysis, after: Analysis): ScanDiff {
  const beforePaths = new Set(before.files.map((f) => f.path))
  const afterPaths = new Set(after.files.map((f) => f.path))
  const filesAdded = [...afterPaths].filter((p) => !beforePaths.has(p)).sort()
  const filesRemoved = [...beforePaths].filter((p) => !afterPaths.has(p)).sort()
  const filesChanged = [...afterPaths].filter((p) => beforePaths.has(p) && signature(before, p) !== signature(after, p)).sort()

  const edgeSet = (a: Analysis) => new Set(a.edges.map((e) => `${e.source}->${e.target}`))
  const bEdges = edgeSet(before)
  const aEdges = edgeSet(after)

  const problemsBefore = before.files.reduce((n, f) => n + f.problems.length, 0)
  const problemsAfter = after.files.reduce((n, f) => n + f.problems.length, 0)

  const beforeProblemPaths = new Set(before.files.filter((f) => f.problems.length > 0).map((f) => f.path))
  const afterProblemPaths = new Set(after.files.filter((f) => f.problems.length > 0).map((f) => f.path))

  return {
    filesAdded,
    filesRemoved,
    filesChanged,
    edgesAdded: [...aEdges].filter((e) => !bEdges.has(e)).length,
    edgesRemoved: [...bEdges].filter((e) => !aEdges.has(e)).length,
    cyclesBefore: before.stats.cycles,
    cyclesAfter: after.stats.cycles,
    problemsBefore,
    problemsAfter,
    newProblemFiles: [...afterProblemPaths].filter((p) => !beforeProblemPaths.has(p)).sort(),
    fixedProblemFiles: [...beforeProblemPaths].filter((p) => !afterProblemPaths.has(p)).sort(),
  }
}
