// Globalny magazyn wysyłek filmów (poza Reactem) — upload trwa także po wyjściu z edytora kursu
// albo przejściu do innego modułu panelu. Przerywa go dopiero zamknięcie / przeładowanie karty.
import { tusUpload, type TusHandle } from './tusUpload'

export interface UploadState {
  itemId: string
  courseId: string
  fileName: string
  sent: number
  total: number
  error?: string
  done?: boolean
}

let state: Record<string, UploadState> = {}
const handles: Record<string, TusHandle> = {}
const listeners = new Set<() => void>()

function emit(next: Record<string, UploadState>) {
  state = next
  listeners.forEach((l) => l())
  syncBeforeUnload()
}
const patch = (itemId: string, p: Partial<UploadState>) => emit({ ...state, [itemId]: { ...state[itemId], ...p } })

export const uploadStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getSnapshot: () => state,
  isActive: (u?: UploadState) => !!u && !u.done && !u.error,
  start(courseId: string, itemId: string, file: File, upload: { endpoint: string; headers: Record<string, string> }) {
    handles[itemId]?.abort()
    emit({ ...state, [itemId]: { itemId, courseId, fileName: file.name, sent: 0, total: file.size } })
    const h = tusUpload({
      endpoint: upload.endpoint,
      headers: upload.headers,
      file,
      resumeKey: itemId,
      onProgress: (sent, total) => patch(itemId, { sent, total }),
    })
    handles[itemId] = h
    h.promise
      .then(() => patch(itemId, { done: true, sent: file.size }))
      .catch((e: unknown) => patch(itemId, { error: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        delete handles[itemId]
      })
  },
  cancel(itemId: string) {
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
