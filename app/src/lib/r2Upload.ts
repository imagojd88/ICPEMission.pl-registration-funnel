// Wysyłka filmu prosto z przeglądarki do Cloudflare R2 (upload wieloczęściowy S3).
// Plik dzielimy na części (16 MB), każdą wysyłamy osobnym podpisanym linkiem PUT z naszego API —
// klucze R2 nie opuszczają serwera, a plik nie przechodzi przez icpe-api. 3 części równolegle,
// ponawianie błędów, wznowienie po zamknięciu karty (API zwraca listę już wgranych części).

import { getUploadPartUrls, type VideoUploadInit } from './courses'

export interface R2UploadOptions {
  courseId: string
  itemId: string
  file: File
  init: VideoUploadInit
  onProgress?: (sent: number, total: number) => void
}

export interface R2UploadHandle {
  promise: Promise<void>
  abort: () => void
}

const PARALLEL = 3
const URL_BATCH = 20

export const CORS_HINT =
  'Przeglądarka nie mogła wysłać pliku do Cloudflare R2. Najczęściej brakuje reguły CORS bucketu — kliknij „Napraw ustawienia wysyłki” na liście kursów i spróbuj ponownie (wysyłka wznowi się od miejsca przerwania).'

export function r2Upload(opts: R2UploadOptions): R2UploadHandle {
  const { file, init } = opts
  const size = file.size
  const partBytes = (n: number) => Math.min(init.partSize, size - (n - 1) * init.partSize)
  const done = new Set(init.doneParts.filter((n) => n >= 1 && n <= init.partCount))
  const todo: number[] = []
  for (let n = 1; n <= init.partCount; n++) if (!done.has(n)) todo.push(n)

  let aborted = false
  const xhrs = new Set<XMLHttpRequest>()
  const urls = new Map<number, string>()
  const inFlight = new Map<number, number>() // bajty wysłane z części w toku
  let completedBytes = [...done].reduce((s, n) => s + partBytes(n), 0)
  let anySuccess = done.size > 0

  const report = () => {
    let fly = 0
    inFlight.forEach((v) => (fly += v))
    opts.onProgress?.(Math.min(size, completedBytes + fly), size)
  }

  async function urlFor(n: number, refresh = false): Promise<string> {
    if (!refresh && urls.has(n)) return urls.get(n)!
    // Pobieramy paczką: ta część + kolejne z kolejki, które jeszcze nie mają linku.
    const batch = [n, ...todo.filter((x) => x !== n && !urls.has(x))].slice(0, URL_BATCH)
    const r = await getUploadPartUrls(opts.courseId, opts.itemId, init.uploadId, batch)
    for (const [k, v] of Object.entries(r.urls)) urls.set(Number(k), v)
    const u = urls.get(n)
    if (!u) throw new Error('Serwer nie zwrócił linku do wysyłki części pliku.')
    return u
  }

  function put(url: string, n: number): Promise<number> {
    return new Promise((resolve, reject) => {
      if (aborted) return reject(new Error('Przerwano'))
      const x = new XMLHttpRequest()
      xhrs.add(x)
      x.open('PUT', url, true)
      x.upload.onprogress = (e) => {
        inFlight.set(n, e.loaded)
        report()
      }
      x.onload = () => {
        xhrs.delete(x)
        resolve(x.status)
      }
      x.onerror = () => {
        xhrs.delete(x)
        resolve(0)
      }
      x.onabort = () => {
        xhrs.delete(x)
        reject(new Error('Przerwano'))
      }
      const start = (n - 1) * init.partSize
      x.send(file.slice(start, start + partBytes(n)))
    })
  }

  async function sendPart(n: number) {
    let refresh = false
    for (let attempt = 0; ; attempt++) {
      if (aborted) throw new Error('Przerwano')
      const status = await put(await urlFor(n, refresh), n)
      inFlight.delete(n)
      if (status >= 200 && status < 300) {
        completedBytes += partBytes(n)
        anySuccess = true
        report()
        return
      }
      if (aborted) throw new Error('Przerwano')
      // Status 0 przy pierwszej części = przeglądarka zablokowała żądanie (CORS) albo brak sieci.
      if (status === 0 && !anySuccess && attempt >= 1) throw new Error(CORS_HINT)
      if (attempt >= 5) throw new Error(status ? `R2 odrzucił część pliku (HTTP ${status}).` : 'Błąd sieci podczas wysyłania.')
      refresh = status === 403 // wygasły link → nowy podpis
      report()
      await new Promise((r) => setTimeout(r, 1000 * 2 ** Math.min(attempt, 4)))
    }
  }

  const promise = (async () => {
    report()
    const queue = [...todo]
    const worker = async () => {
      while (queue.length) {
        const n = queue.shift()!
        await sendPart(n)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length || 1) }, worker))
    } catch (e) {
      aborted = true
      xhrs.forEach((x) => x.abort())
      throw e
    }
  })()

  return {
    promise,
    abort: () => {
      aborted = true
      xhrs.forEach((x) => x.abort())
    },
  }
}

/**
 * Sprawdzenie pliku w przeglądarce przed wysyłką: czas trwania, miniatura (klatka ~10% filmu)
 * i czy przeglądarka w ogóle umie go odtworzyć (np. HEVC z iPhone'a w Chrome — nie).
 */
export function probeVideo(file: File, timeoutMs = 20000): Promise<{ duration: number | null; thumb: Blob | null; playable: boolean }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    let duration: number | null = null
    let finished = false
    const finish = (thumb: Blob | null, playable: boolean) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      v.removeAttribute('src')
      v.load()
      URL.revokeObjectURL(url)
      resolve({ duration, thumb, playable })
    }
    const timer = setTimeout(() => finish(null, duration !== null), timeoutMs)
    v.onerror = () => finish(null, false)
    v.onloadedmetadata = () => {
      duration = Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null
      // Brak obrazu (videoWidth 0) = przeglądarka nie dekoduje ścieżki wideo.
      if (!v.videoWidth) return finish(null, false)
      v.currentTime = Math.min(30, Math.max(1, (v.duration || 10) * 0.1))
    }
    v.onseeked = () => {
      try {
        const w = Math.min(640, v.videoWidth)
        const h = Math.round((v.videoHeight / v.videoWidth) * w)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        c.getContext('2d')?.drawImage(v, 0, 0, w, h)
        c.toBlob((b) => finish(b, true), 'image/jpeg', 0.82)
      } catch {
        finish(null, true)
      }
    }
    v.src = url
  })
}

/** Klucz wznowienia w pamięci przeglądarki (ten sam plik = ta sama nazwa, rozmiar i data). */
export const resumeKey = (itemId: string, f: File) => `r2up:${itemId}:${f.name}:${f.size}:${f.lastModified}`
