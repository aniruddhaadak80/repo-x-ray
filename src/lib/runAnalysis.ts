import { analyze } from './analyze'
import type { Analysis, ConfigFile, RawFile } from './types'
import type { AnalyzeRequest, AnalyzeResponse } from './analyze.worker'

/**
 * Run the analyzer off the main thread when Workers are available
 * (keeps the UI responsive on huge repos), falling back to a direct
 * synchronous call otherwise (older Safari, tests, SSR).
 */
export function runAnalysis(rootName: string, files: RawFile[], configs: ConfigFile[]): Promise<Analysis> {
  if (typeof Worker === 'undefined') return Promise.resolve(analyze(files, rootName, configs))
  return new Promise<Analysis>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(analyze(files, rootName, configs))
      return
    }
    const req: AnalyzeRequest = { id: Date.now(), rootName, files, configs }
    worker.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
      const res = e.data
      worker.terminate()
      if (res.ok && res.analysis) resolve(res.analysis)
      else reject(new Error(res.error ?? 'worker failed'))
    }
    worker.onerror = (err) => {
      worker.terminate()
      // worker failed to boot — fall back to main-thread analysis
      try {
        resolve(analyze(files, rootName, configs))
      } catch (e2) {
        reject(err instanceof ErrorEvent ? new Error(err.message) : e2)
      }
    }
    worker.postMessage(req)
  })
}
