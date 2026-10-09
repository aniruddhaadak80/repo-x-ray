/// <reference lib="webworker" />
import { analyze } from './analyze'
import type { Analysis, ConfigFile, RawFile } from './types'

export interface AnalyzeRequest {
  id: number
  rootName: string
  files: RawFile[]
  configs: ConfigFile[]
  mode?: 'regex' | 'ast' | 'hybrid'
}

export interface AnalyzeResponse {
  id: number
  ok: boolean
  analysis?: Analysis
  error?: string
  engine?: 'regex' | 'typescript-ast'
}

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  const { id, rootName, files, configs, mode } = e.data
  try {
    let tsLib: typeof import('typescript') | undefined
    let engine: 'regex' | 'typescript-ast' = 'regex'
    const effectiveMode = mode ?? 'regex'
    if (effectiveMode !== 'regex') {
      try {
        tsLib = await import('typescript')
        engine = 'typescript-ast'
      } catch {
        tsLib = undefined
        engine = 'regex'
      }
    }
    const analysis = analyze(files, rootName, configs, { tsLib, mode: tsLib ? effectiveMode : 'regex' })
    const res: AnalyzeResponse = { id, ok: true, analysis, engine }
    self.postMessage(res)
  } catch (err) {
    const res: AnalyzeResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
    self.postMessage(res)
  }
}
