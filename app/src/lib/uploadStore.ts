// Globalny magazyn wysyłek filmów (poza Reactem) — upload trwa także po wyjściu z edytora kursu
// albo przejściu do innego modułu panelu. Przerywa go dopiero zamknięcie / przeładowanie karty
// (a i wtedy da się go wznowić: wybierz ten sam plik — wyślą się tylko brakujące części).
import { completeVideoUpload, renewVideoUpload, type VideoUploadInit } from './courses'
import { probeVideo, r2Upload, resumeKey, type R2UploadHandle } from './r2Upload'

export interface UploadState {
  itemId: string
  courseId: string
  fileName: string
  sent: number
  total: number
  /** uploading → finishing (składanie pliku w R2 + miniatura) → done */
  phase?: 'preparing' | 'uploading' | 'finishing'
  error?: string
  done?: boolean
}

let state: Record<string, UploadState> = {}
const handles: Record<string, R2UploadHandle> = {}
const cancelled = new Set<string>()
const listeners = new Set<() => void>()

function emit(next: Record<string, UploadState>) {
  state = next
  listeners.forEach((l) => l())
  syncBeforeUnload()
}
const patch = (itemId: string, p: Partial<UploadState>) => emit({ ...state, [itemId]: { ...state[itemId], ...p } })

function storageGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function storageSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

const meta = (file: File) => ({ size: file.size, contentType: file.type || 'video/mp4', fileName: file.name })

async function run(courseId: string, itemId: string, file: File, given?: VideoUploadInit) {
  const key = resumeKey(itemId, file)
  // Czas trwania i miniatura liczą się równolegle z wysyłką.
  const probe = probeVideo(file)
  let init = given
  if (!init) {
    const r = await renewVideoUpload(courseId, itemId, { ...meta(file), resumeUploadId: storageGet(key) })
    init = r.upload
  }
  if (cancelled.has(itemId)) throw new Error('Przerwano')
  storageSet(key, init.uploadId)
  patch(itemId, { phase: 'uploading' })
  const h = r2Upload({ courseId, itemId, file, init, onProgress: (sent, total) => patch(itemId, { sent, total }) })
  handles[itemId] = h
  await h.promise
  patch(itemId, { phase: 'finishing', sent: file.size })
  const p = await probe
  const r = await completeVideoUpload(courseId, itemId, {
    uploadId: init.uploadId,
    size: file.size,
    durationSec: p.duration,
    thumbnail: !!p.thumb,
  })
  storageSet(key, null)
  if (p.thumb && r.thumbnailUpload) {
    await fetch(r.thumbnailUpload.url, { method: 'PUT', body: p.thumb, headers: { 'Content-Type': 'image/jpeg' } }).catch(() => undefined)
  }
}

export const uploadStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getSnapshot: () => state,
  isActive: (u?: UploadState) => !!u && !u.done && !u.error,
  /** `init` — dane świeżo utworzonego uploadu (nowy film); bez niego API wznowi albo zacznie nową wysyłkę. */
  start(courseId: string, itemId: string, file: File, init?: VideoUploadInit) {
    handles[itemId]?.abort()
    cancelled.delete(itemId)
    emit({ ...state, [itemId]: { itemId, courseId, fileName: file.name, sent: 0, total: file.size, phase: 'preparing' } })
    run(courseId, itemId, file, init)
      .then(() => patch(itemId, { done: true, phase: undefined, sent: file.size }))
      .catch((e: unknown) => patch(itemId, { error: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        delete handles[itemId]
      })
  },
  cancel(itemId: string) {
    cancelled.add(itemId)
    handles[itemId]?.abort()
  },
}

// Ostrzeżenie przeglądarki przy zamykaniu karty, gdy coś się wysyła.
let unloadBound = false
function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault()
  e.returnValue = ''
}
function syncBeforeUnload() {
  const active = Object.values(state).some((u) => uploadStore.isActive(u))
  if (active && !unloadBound) {
    window.addEventListener('beforeunload', onBeforeUnload)
    unloadBound = true
  } else if (!active && unloadBound) {
    window.removeEventListener('beforeunload', onBeforeUnload)
    unloadBound = false
  }
}
