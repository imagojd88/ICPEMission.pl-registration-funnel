// Minimalny klient protokołu TUS 1.0 (creation + resumable PATCH) dla uploadu wideo
// prosto z przeglądarki do Bunny Stream. Bez zależności (tus-js-client niepotrzebny).
// Podpis (AuthorizationSignature/Expire, VideoId, LibraryId) dostajemy z naszego API.

export interface TusOptions {
  endpoint: string
  headers: Record<string, string>
  file: File
  metadata?: Record<string, string>
  chunkSize?: number
  onProgress?: (sent: number, total: number) => void
  /** Klucz do zapamiętania URL uploadu (wznowienie po odświeżeniu strony). */
  resumeKey?: string
}

export interface TusHandle {
  promise: Promise<void>
  abort: () => void
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))

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

export function tusUpload(opts: TusOptions): TusHandle {
  const chunkSize = opts.chunkSize ?? 16 * 1024 * 1024
  const file = opts.file
  let xhr: XMLHttpRequest | null = null
  let aborted = false
  const storeKey = opts.resumeKey ? `tus:${opts.resumeKey}:${file.name}:${file.size}:${file.lastModified}` : null

  function request(method: string, url: string, headers: Record<string, string>, body?: Blob): Promise<XMLHttpRequest> {
    return new Promise((resolve, reject) => {
      if (aborted) return reject(new Error('Przerwano'))
      const x = new XMLHttpRequest()
      xhr = x
      x.open(method, url, true)
      x.setRequestHeader('Tus-Resumable', '1.0.0')
      for (const [k, v] of Object.entries({ ...opts.headers, ...headers })) x.setRequestHeader(k, v)
      if (body && opts.onProgress) {
        const base = Number(headers['Upload-Offset'] ?? 0)
        x.upload.onprogress = (e) => opts.onProgress?.(base + e.loaded, file.size)
      }
      x.onload = () => resolve(x)
      x.onerror = () => reject(new Error('Błąd sieci podczas wysyłania'))
      x.onabort = () => reject(new Error('Przerwano'))
      x.send(body ?? null)
    })
  }

  async function createUpload(): Promise<string> {
    const meta = { filetype: file.type || 'video/mp4', title: file.name, ...(opts.metadata ?? {}) }
    const res = await request('POST', opts.endpoint, {
      'Upload-Length': String(file.size),
      'Upload-Metadata': Object.entries(meta)
        .map(([k, v]) => `${k} ${b64(v)}`)
        .join(','),
    })
    if (res.status !== 201) throw new Error(`Serwer wideo odrzucił upload (${res.status}) ${res.responseText?.slice(0, 200) ?? ''}`)
    const loc = res.getResponseHeader('Location')
    if (!loc) throw new Error('Brak adresu uploadu (Location) w odpowiedzi serwera wideo.')
    return new URL(loc, opts.endpoint).toString()
  }

  async function currentOffset(url: string): Promise<number | null> {
    try {
      const res = await request('HEAD', url, {})
      if (res.status !== 200 && res.status !== 204) return null
      const off = Number(res.getResponseHeader('Upload-Offset'))
      return Number.isFinite(off) ? off : null
    } catch {
      return null
    }
  }

  const promise = (async () => {
    let url = storeKey ? storageGet(storeKey) : null
    let offset = 0
    if (url) {
      const off = await currentOffset(url)
      if (off === null) url = null
      else offset = off
    }
    if (!url) {
      url = await createUpload()
      if (storeKey) storageSet(storeKey, url)
    }
    opts.onProgress?.(offset, file.size)
    let retries = 0
    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size)
      try {
        const res = await request(
          'PATCH',
          url,
          { 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
          file.slice(offset, end),
        )
        if (res.status !== 204 && res.status !== 200) throw new Error(`Błąd wysyłania (${res.status})`)
        const next = Number(res.getResponseHeader('Upload-Offset'))
        offset = Number.isFinite(next) && next > offset ? next : end
        retries = 0
        opts.onProgress?.(offset, file.size)
      } catch (e) {
        if (aborted || retries >= 5) throw e
        retries++
        await new Promise((r) => setTimeout(r, 1000 * 2 ** retries))
        const off = await currentOffset(url)
        if (off !== null) offset = off
      }
    }
    if (storeKey) storageSet(storeKey, null)
  })()

  return {
    promise,
    abort: () => {
      aborted = true
      xhr?.abort()
    },
  }
}
