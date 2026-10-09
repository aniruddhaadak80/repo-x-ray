import type { Analysis } from './types'

const DB_NAME = 'repo-x-ray'
const DB_VERSION = 1
const STORE = 'scans'

export interface ScanRecord {
  id: string // uuid
  rootName: string
  savedAt: number
  analysis: Analysis
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export async function saveScan(record: ScanRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(record))
}

export async function listScans(): Promise<ScanRecord[]> {
  const all = await tx<ScanRecord[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => b.savedAt - a.savedAt)
}

export async function getScan(id: string): Promise<ScanRecord | undefined> {
  return tx<ScanRecord | undefined>('readonly', (s) => s.get(id))
}

export async function deleteScan(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

export function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
