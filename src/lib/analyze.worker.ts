/// <reference lib="webworker" />
import { analyze } from './analyze'
import type { Analysis, ConfigFile, RawFile } from './types'

export interface AnalyzeRequest {
  id: number
  rootName: string
  files: RawFile[]
  configs: ConfigFile[]
}

export interface AnalyzeResponse {
  id: number
  ok: boolean
  analysis?: Analysis
  error?: string
}

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { id, rootName, files, configs } = e.data
  try {
    const analysis = analyze(files, rootName, configs)
    const res: AnalyzeResponse = { id, ok: true, analysis }
    self.postMessage(res)
  } catch (err) {
    const res: AnalyzeResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
    self.postMessage(res)
  }
}
