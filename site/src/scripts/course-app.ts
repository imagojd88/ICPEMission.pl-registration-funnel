// Panel kursanta „Formacja online" (icpemission.pl/formacja/<slug>) — aplikacja kliencka bez frameworka.
// Widoki: loading → login | setpw (link z maila ?haslo=) | forgot → dashboard (filmy + PDF).
// Treści z panelu admina wstawiamy WYŁĄCZNIE przez textContent (bez innerHTML).

import { resolveLang, saveLang, getSavedLang } from './lang-pref';

type Lang = 'pl' | 'en';
type LangText = string | Record<string, string> | null | undefined;
type View = 'loading' | 'login' | 'forgot' | 'setpw' | 'dashboard' | 'closed' | 'notfound' | 'list';

interface Item {
  id: string;
  kind: 'VIDEO' | 'PDF';
  title: LangText;
  description: LangText;
  durationSec: number | null;
  thumbnailUrl: string | null;
  langs?: Lang[];
  /** Film jeszcze się koduje — pokazujemy zaślepkę. */
  pending?: boolean;
  /** Tylko podgląd admina: materiał zaplanowany, kursanci go jeszcze nie widzą. */
  scheduledAt?: string;
  /** Kursant ukończył materiał (90% filmu, otwarty PDF albo „Oznaczam jako ukończone"). */
  done?: boolean;
}
interface Module {
  id: string;
  title: LangText;
  description: LangText;
  locked: boolean;
  done: boolean;
  total: number;
  doneCount: number;
  items: Item[];
}
interface CourseData {
  preview?: { status: string } | null;
  slug: string;
  title: LangText;
  description: LangText;
  sequential?: boolean;
  member: { firstName: string; email: string } | null;
  /** Moduły (puste = kurs bez modułów). Z zablokowanych API zwraca tylko najbliższy, bez materiałów. */
  modules?: Module[];
  lockedRemaining?: number;
  /** Materiały bez modułu (w kursie bez modułów — wszystkie). */
  items: Item[];
}

const root = document.getElementById('course-app') as HTMLElement | null;
if (root) init(root);

function init(root: HTMLElement) {
  const API = (root.dataset.api || '').replace(/\/+$/, '');
  const TOKEN_KEY = 'icpe_member_token';
  const LANG_KEY = 'icpe_course_lang';
  let slug = root.dataset.slug || (location.pathname.match(/^\/formacja\/([a-z0-9-]+)/)?.[1] ?? '');
  let lang: Lang = 'pl';
  let course: CourseData | null = null;
  let current: View = 'loading';
  let playing: { id: string; expiresAt: number; retried: boolean } | null = null;

  const T = {
    pl: {
      connecting: 'Łączę się z serwerem…',
      waking: 'Serwer się wybudza — to może potrwać do minuty.',
      loginFail: 'Nie udało się zalogować.',
      network: 'Brak połączenia z serwerem. Spróbuj ponownie za chwilę.',
      fill: 'Uzupełnij e-mail i hasło.',
      forgotSent: 'Jeśli ten adres ma dostęp do kursu, za chwilę dostaniesz maila z linkiem (sprawdź też SPAM).',
      pwShort: 'Hasło musi mieć co najmniej 8 znaków.',
      pwMismatch: 'Hasła się różnią.',
      hello: (n: string) => (n ? `Witaj, ${n}!` : 'Witaj!'),
      open: 'Otwórz',
      download: 'Pobierz',
      pdf: 'PDF',
      fileErr: 'Nie udało się otworzyć pliku.',
      playErr: 'Nie udało się uruchomić filmu.',
      video: 'Wideo',
      onlyOther: 'dostępny tylko po angielsku',
      soon: 'Film będzie wkrótce dostępny',
      scheduled: (d: string) => `Zaplanowane na ${d} — kursanci jeszcze tego nie widzą`,
      preview: 'Podgląd administratora — tak widzą kurs kursanci. Twoja aktywność nie jest zapisywana.',
      previewDraft: ' Kurs jest jeszcze szkicem — kursanci go nie widzą.',
      linkExpired: 'Ten link wygasł albo został już użyty. Wpisz e-mail w „Nie pamiętam hasła", a wyślemy nowy.',
      module: (n: number) => `Moduł ${n}`,
      materials: 'Materiały',
      done: 'Ukończone',
      markDone: 'Oznaczam jako ukończone',
      moduleDone: 'Moduł ukończony',
      progress: (d: number, t: number) => `${d} z ${t} ukończone`,
      locked: 'Odblokuje się po ukończeniu poprzedniego modułu.',
      moreLocked: (n: number) => (n === 1 ? 'Jeszcze 1 kolejny moduł.' : `Jeszcze ${n} kolejne moduły.`),
      emptyModule: 'Materiały tego modułu pojawią się wkrótce.',
      seqPreview: ' Kurs ma tryb sekwencyjny — kursanci widzą kolejny moduł dopiero po ukończeniu poprzedniego (w podglądzie widzisz wszystkie).',
      unlocked: 'Odblokowano kolejny moduł!',
      allDone: 'Gratulacje — ukończono wszystkie moduły!',
      playErrRetry: 'Film się nie wczytał. Spróbuj ponownie za chwilę.',
    },
    en: {
      connecting: 'Connecting to the server…',
      waking: 'The server is waking up — this can take up to a minute.',
      loginFail: 'Login failed.',
      network: 'Cannot reach the server. Please try again in a moment.',
      fill: 'Enter your e-mail and password.',
      forgotSent: 'If this address has access to the course, you will receive an e-mail with a link shortly (check SPAM too).',
      pwShort: 'The password must have at least 8 characters.',
      pwMismatch: 'Passwords do not match.',
      hello: (n: string) => (n ? `Welcome, ${n}!` : 'Welcome!'),
      open: 'Open',
      download: 'Download',
      pdf: 'PDF',
      fileErr: 'Could not open the file.',
      playErr: 'Could not start the video.',
      video: 'Video',
      onlyOther: 'available in Polish only',
      soon: 'Video will soon be available',
      scheduled: (d: string) => `Scheduled for ${d} — participants cannot see it yet`,
      preview: 'Administrator preview — this is what participants see. Your activity is not recorded.',
      previewDraft: ' The course is still a draft — participants cannot see it.',
      linkExpired: 'This link has expired or was already used. Use "Forgot password" to get a new one.',
      module: (n: number) => `Module ${n}`,
      materials: 'Materials',
      done: 'Completed',
      markDone: 'Mark as completed',
      moduleDone: 'Module completed',
      progress: (d: number, t: number) => `${d} of ${t} completed`,
      locked: 'Unlocks when you complete the previous module.',
      moreLocked: (n: number) => (n === 1 ? 'One more module after this one.' : `${n} more modules after this one.`),
      emptyModule: 'The materials for this module will appear soon.',
      seqPreview: ' This course is sequential — participants see the next module only after completing the previous one (in preview you see all).',
      unlocked: 'The next module is now unlocked!',
      allDone: 'Congratulations — all modules completed!',
      playErrRetry: 'The video did not load. Please try again in a moment.',
    },
  };
  const tr = () => T[lang];

  // ── Pamięć przeglądarki (bywa zablokowana — zawsze try/catch) ──
  const store = {
    get: (k: string) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k: string, v: string | null) => {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {
        /* ignore */
      }
    },
  };

  const $ = <E extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as E | null;
  const pick = (v: LangText) => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v[lang] || v.pl || v.en || Object.values(v).find(Boolean) || '';
  };
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const fmtDur = (s: number | null) => {
    if (!s) return '';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  // ── Język ──
  /** `persist` = ręczny wybór gościa (zapamiętany na całej icpemission.pl, także w rejestracji). */
  function setLang(l: Lang, persist = false) {
    lang = l;
    if (persist) saveLang(l);
    root.setAttribute('data-lang', l);
    document.documentElement.lang = l;
    if (course && current === 'dashboard') renderDashboard();
    renderHeader();
  }
  root.querySelectorAll<HTMLButtonElement>('[data-langbtn]').forEach((b) =>
    b.addEventListener('click', () => setLang((b.dataset.langbtn as Lang) || 'pl', true)),
  );

  // ── Widoki ──
  function show(v: View) {
    current = v;
    root.querySelectorAll<HTMLElement>('[data-view]').forEach((s) => (s.hidden = s.dataset.view !== v));
    ($('#ca-logout') as HTMLElement).hidden = v !== 'dashboard';
    const first = root.querySelector<HTMLInputElement>(`[data-view="${v}"] input`);
    if (first && window.innerWidth > 640) setTimeout(() => first.focus(), 30);
  }
  function msg(form: HTMLElement, text: string | null, ok = false) {
    const m = form.querySelector<HTMLElement>('[data-msg]');
    if (!m) return;
    m.hidden = !text;
    m.textContent = text ?? '';
    m.classList.toggle('ok', ok);
  }

  // ── API ──
  class ApiError extends Error {
    constructor(public status: number, message: string, public body?: Record<string, unknown>) {
      super(message);
    }
  }
  let wakeTimer: number | undefined;
  async function api<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body) headers['Content-Type'] = 'application/json';
    const tok = store.get(TOKEN_KEY);
    if (auth && tok) headers.Authorization = `Bearer ${tok}`;
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, tr().network);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const m = body.message;
      const text = Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : `HTTP ${res.status}`;
      throw new ApiError(res.status, text, body);
    }
    return body as T;
  }

  function setLoading(text: string) {
    show('loading');
    const p = $('#ca-loading-text');
    if (p) p.textContent = text;
    window.clearTimeout(wakeTimer);
    wakeTimer = window.setTimeout(() => {
      if (current === 'loading' && p) p.textContent = tr().waking;
    }, 4000);
  }

  // ── Nagłówek kursu (tytuł/opis z API — dla strony-fallbacku bez danych z buildu) ──
  let headerData: { title: LangText; description: LangText } | null = null;
  function renderHeader() {
    if (!headerData) return;
    const h = $('#ca-title');
    const d = $('#ca-desc');
    if (h) h.textContent = pick(headerData.title);
    if (d) d.textContent = pick(headerData.description);
    document.title = `${pick(headerData.title)} — Formacja online · ICPE Mission`;
  }

  // ── Dashboard ──
  function renderDashboard() {
    if (!course) return;
    headerData = { title: course.title, description: course.description };
    renderHeader();
    const hello = $('#ca-hello');
    if (hello) hello.textContent = course.preview ? '' : tr().hello(course.member?.firstName ?? '');
    const pv = $('#ca-preview');
    if (pv) {
      pv.hidden = !course.preview;
      pv.textContent = course.preview
        ? tr().preview + (course.preview.status === 'DRAFT' ? tr().previewDraft : '') + (course.sequential ? tr().seqPreview : '')
        : '';
    }
    const modules = course.modules ?? [];
    const loose = course.items;
    const vBox = $('#ca-videos')!;
    const dBox = $('#ca-docs')!;
    const mBox = $('#ca-modules')!;
    vBox.replaceChildren();
    dBox.replaceChildren();
    mBox.replaceChildren();

    if (!modules.length) {
      // Kurs bez modułów — dotychczasowy układ: Filmy + Materiały.
      mBox.hidden = true;
      const videos = loose.filter((i) => i.kind === 'VIDEO');
      const docs = loose.filter((i) => i.kind === 'PDF');
      $('#ca-videos-h')!.hidden = videos.length === 0;
      vBox.hidden = videos.length === 0;
      $('#ca-docs-h')!.hidden = docs.length === 0;
      dBox.hidden = docs.length === 0;
      $('#ca-empty')!.hidden = loose.length > 0;
      for (const v of videos) vBox.append(videoCard(v));
      for (const d of docs) dBox.append(docRow(d));
      return;
    }

    // Kurs z modułami: najpierw materiały bez modułu (zawsze dostępne), potem moduły po kolei.
    $('#ca-videos-h')!.hidden = true;
    vBox.hidden = true;
    $('#ca-docs-h')!.hidden = true;
    dBox.hidden = true;
    $('#ca-empty')!.hidden = true;
    mBox.hidden = false;
    if (loose.length) {
      const sec = el('section', 'ca-module ca-module-loose');
      const head = el('div', 'ca-module-head');
      head.append(el('h2', 'ca-module-title', tr().materials));
      sec.append(head, itemsBlock(loose));
      mBox.append(sec);
    }
    modules.forEach((m, idx) => mBox.append(moduleSection(m, idx + 1)));
    const rest = course.lockedRemaining ?? 0;
    if (rest > 0) mBox.append(el('p', 'ca-muted ca-more-locked', tr().moreLocked(rest)));
    if (!course.preview && modules.length && modules.every((m) => m.done) && rest === 0) {
      mBox.append(el('p', 'ca-all-done', tr().allDone));
    }
  }

  function moduleSection(m: Module, n: number): HTMLElement {
    const sec = el('section', `ca-module${m.locked ? ' ca-module-locked' : ''}${m.done ? ' ca-module-done' : ''}`);
    sec.dataset.module = m.id;
    const head = el('div', 'ca-module-head');
    head.append(el('span', 'ca-module-num', (m.locked ? '🔒 ' : '') + tr().module(n)));
    head.append(el('h2', 'ca-module-title', pick(m.title)));
    if (!m.locked && m.total > 0 && !course?.preview) {
      head.append(el('span', `ca-module-progress${m.done ? ' is-done' : ''}`, m.done ? `✓ ${tr().moduleDone}` : tr().progress(m.doneCount, m.total)));
    }
    sec.append(head);
    const desc = pick(m.description);
    if (desc && !m.locked) sec.append(el('p', 'ca-module-desc', desc));
    if (m.locked) {
      sec.append(el('p', 'ca-module-desc', tr().locked));
      return sec;
    }
    if (!m.items.length) {
      sec.append(el('p', 'ca-module-desc', tr().emptyModule));
      return sec;
    }
    sec.append(itemsBlock(m.items));
    return sec;
  }

  /** Filmy (siatka) + PDF-y (lista) jednej grupy. */
  function itemsBlock(items: Item[]): HTMLElement {
    const wrap = el('div', 'ca-module-body');
    const videos = items.filter((i) => i.kind === 'VIDEO');
    const docs = items.filter((i) => i.kind === 'PDF');
    if (videos.length) {
      const g = el('div', 'ca-grid');
      for (const v of videos) g.append(videoCard(v));
      wrap.append(g);
    }
    if (docs.length) {
      const l = el('div', 'ca-list');
      for (const d of docs) l.append(docRow(d));
      wrap.append(l);
    }
    return wrap;
  }

  /** Znacznik „Ukończone" albo przycisk „Oznaczam jako ukończone" (nie w podglądzie admina). */
  function doneControl(i: Item): HTMLElement | null {
    if (i.done) return el('span', 'ca-done', `✓ ${tr().done}`);
    if (course?.preview || i.pending) return null;
    const b = el('button', 'ca-mark', tr().markDone);
    b.type = 'button';
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void markDone(i, b);
    });
    return b;
  }

  function videoCard(v: Item): HTMLElement {
    if (v.pending) {
      // Zaślepka: film jeszcze się wysyła — nieklikalna karta z informacją.
      const card = el('div', 'ca-video ca-video-pending');
      const thumb = el('div', 'ca-thumb ca-thumb-pending');
      thumb.append(el('span', 'ca-soon', tr().soon));
      const body = el('div', 'ca-video-body');
      body.append(el('div', 'ca-item-title', pick(v.title)));
      const desc = pick(v.description);
      if (desc) body.append(el('p', 'ca-item-desc', desc));
      if (v.scheduledAt) body.append(el('p', 'ca-item-desc ca-item-sched', tr().scheduled(fmtDate(v.scheduledAt))));
      card.append(thumb, body);
      return card;
    }
    const card = el('div', `ca-video${v.done ? ' is-done' : ''}`);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const thumb = el('div', 'ca-thumb');
    if (v.thumbnailUrl) thumb.style.backgroundImage = `url("${encodeURI(v.thumbnailUrl)}")`;
    thumb.append(el('span', 'ca-play'));
    if (v.durationSec) thumb.append(el('span', 'ca-dur', fmtDur(v.durationSec)));
    const body = el('div', 'ca-video-body');
    body.append(el('div', 'ca-item-title', pick(v.title)));
    const desc = pick(v.description);
    if (desc) body.append(el('p', 'ca-item-desc', desc));
    if (v.scheduledAt) body.append(el('p', 'ca-item-desc ca-item-sched', tr().scheduled(fmtDate(v.scheduledAt))));
    const dc = doneControl(v);
    if (dc) body.append(dc);
    card.append(thumb, body);
    card.addEventListener('click', () => void play(v));
    card.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
        e.preventDefault();
        void play(v);
      }
    });
    return card;
  }

  function docRow(d: Item): HTMLElement {
    const row = el('div', `ca-item${d.done ? ' is-done' : ''}`);
    row.append(el('div', 'ca-pdf-ico', tr().pdf));
    const main = el('div', 'ca-item-main');
    main.append(el('div', 'ca-item-title', pick(d.title)));
    const desc = pick(d.description);
    if (desc) main.append(el('p', 'ca-item-desc', desc));
    if (d.scheduledAt) main.append(el('p', 'ca-item-desc ca-item-sched', tr().scheduled(fmtDate(d.scheduledAt))));
    // Plik tylko w drugim języku — uprzedzamy (API i tak poda dostępną wersję).
    if (d.langs && d.langs.length && !d.langs.includes(lang)) main.append(el('p', 'ca-item-desc ca-item-note', tr().onlyOther));
    const dc = doneControl(d);
    if (dc) main.append(dc);
    const actions = el('div', 'ca-item-actions');
    const open = el('button', 'ca-btn ca-btn-light', tr().open);
    open.type = 'button';
    open.addEventListener('click', () => void openFile(d, false));
    const dl = el('button', 'ca-btn ca-btn-light', tr().download);
    dl.type = 'button';
    dl.addEventListener('click', () => void openFile(d, true));
    actions.append(open, dl);
    row.append(main, actions);
    return row;
  }

  /** Liczba odblokowanych modułów — do wykrycia „odblokowano kolejny moduł" po odświeżeniu. */
  const openModules = (c: CourseData | null) => (c?.modules ?? []).filter((m) => !m.locked).length;

  /** Podmiana danych kursu + komunikat, gdy odblokował się kolejny moduł. */
  function applyCourse(next: CourseData) {
    const before = openModules(course);
    course = next;
    if (current === 'dashboard') renderDashboard();
    if (openModules(next) > before && before > 0) toast(tr().unlocked);
  }

  let toastTimer: number | undefined;
  function toast(text: string) {
    const t = $('#ca-toast');
    if (!t) return;
    t.textContent = text;
    t.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (t.hidden = true), 5000);
  }

  async function markDone(i: Item, btn: HTMLButtonElement) {
    btn.disabled = true;
    try {
      const next = await api<CourseData>(`/member/courses/${slug}/items/${i.id}/complete`, { method: 'POST' }, true);
      applyCourse(next);
    } catch (e) {
      btn.disabled = false;
      handleAuthError(e, tr().fileErr);
    }
  }

  /** Ciche odświeżenie kursu (np. po obejrzeniu filmu — mógł się odblokować kolejny moduł). */
  async function refreshCourse() {
    try {
      applyCourse(await api<CourseData>(`/member/courses/${slug}`, {}, true));
    } catch {
      /* spróbujemy przy następnej okazji */
    }
  }

  const videoEl = () => $('#ca-video') as HTMLVideoElement;
  // Bez menu „Zapisz film jako…” (to tylko utrudnienie — link i tak wygasa po kilku godzinach).
  videoEl()?.addEventListener('contextmenu', (e) => e.preventDefault());

  async function play(v: Item, resumeAt?: number) {
    try {
      const r = await api<{ videoUrl: string; expiresAt: string; track?: boolean; poster?: string | null }>(
        `/member/courses/${slug}/items/${v.id}/play`,
        {},
        true,
      );
      const same = playing?.id === v.id;
      if (!same) tracker.stop();
      const player = $('#ca-player')!;
      const video = videoEl();
      video.poster = r.poster || '';
      video.src = r.videoUrl;
      video.setAttribute('aria-label', pick(v.title) || tr().video);
      $('#ca-player-title')!.textContent = pick(v.title);
      player.hidden = false;
      playing = { id: v.id, expiresAt: Date.parse(r.expiresAt), retried: false };
      if (resumeAt) {
        video.addEventListener('loadedmetadata', () => (video.currentTime = resumeAt), { once: true });
        void video.play().catch(() => undefined);
      }
      if (r.track !== false && !same) tracker.start(v.id, video);
      if (!same) player.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      handleAuthError(e, tr().playErr);
    }
  }
  function closePlayer() {
    tracker.stop();
    const video = videoEl();
    video.pause();
    video.removeAttribute('src');
    video.load();
    $('#ca-player')!.hidden = true;
    playing = null;
  }
  $('#ca-player-close')?.addEventListener('click', closePlayer);
  // Podpisany link do filmu wygasa po kilku godzinach: przy błędzie wczytywania pobieramy nowy i wracamy do tego miejsca.
  videoEl()?.addEventListener('error', () => {
    if (!playing || !course) return;
    const it = allItems().find((i) => i.id === playing!.id);
    if (!it) return;
    if (playing.retried) {
      window.alert(tr().playErrRetry);
      return;
    }
    const at = videoEl().currentTime || 0;
    playing.retried = true;
    void play(it, at);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playing && Date.now() > playing.expiresAt - 60_000 && course) {
      const it = allItems().find((i) => i.id === playing!.id);
      const video = videoEl();
      if (it && video.paused) void play(it, video.currentTime || 0);
    }
  });
  const allItems = () => [...(course?.items ?? []), ...(course?.modules ?? []).flatMap((m) => m.items)];

  // ── Postęp oglądania (HTML5 <video>): zbieramy obejrzane 10-sekundowe odcinki, wysyłamy co 15 s ──
  const tracker = (() => {
    const BUCKET = 10;
    let itemId: string | null = null;
    let pending = new Set<number>();
    let position = 0;
    let duration = 0;
    let timer: number | undefined;
    let dirty = false;
    let video: HTMLVideoElement | null = null;

    function flush() {
      if (!itemId || !dirty || !duration) return;
      const body = JSON.stringify({ buckets: [...pending], position: Math.round(position), duration: Math.round(duration) });
      const id = itemId;
      pending = new Set();
      dirty = false;
      const tok = store.get(TOKEN_KEY);
      // keepalive: wysyłka przetrwa zamknięcie karty
      void fetch(`${API}/member/courses/${slug}/items/${id}/progress`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: { completed?: boolean } | null) => {
          // Film właśnie przekroczył 90% → odśwież (znacznik „Ukończone", może odblokować kolejny moduł).
          const it = allItems().find((i) => i.id === id);
          if (r?.completed && it && !it.done) void refreshCourse();
        })
        .catch(() => undefined);
    }

    const onTime = () => {
      if (!video || !itemId) return;
      position = video.currentTime;
      duration = Number.isFinite(video.duration) ? video.duration : duration;
      // Liczymy tylko faktyczne odtwarzanie (nie samo przewinięcie suwaka).
      if (!video.paused && !video.seeking) {
        pending.add(Math.floor(position / BUCKET));
        dirty = true;
      }
    };

    function start(id: string, v: HTMLVideoElement) {
      stop();
      itemId = id;
      video = v;
      v.addEventListener('timeupdate', onTime);
      v.addEventListener('pause', flush);
      v.addEventListener('ended', flush);
      timer = window.setInterval(flush, 15000);
    }

    function stop() {
      flush();
      window.clearInterval(timer);
      if (video) {
        video.removeEventListener('timeupdate', onTime);
        video.removeEventListener('pause', flush);
        video.removeEventListener('ended', flush);
      }
      video = null;
      itemId = null;
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
    return { start, stop };
  })();

  async function openFile(d: Item, download: boolean) {
    // Okno otwieramy synchronicznie (inaczej blokada wyskakujących okien), adres ustawiamy po odpowiedzi API.
    const w = download ? null : window.open('about:blank', '_blank');
    try {
      const r = await api<{ path: string; downloadPath: string }>(
        `/member/courses/${slug}/items/${d.id}/file?lang=${lang}&action=${download ? 'download' : 'open'}`,
        {},
        true,
      );
      const url = `${API}${download ? r.downloadPath : r.path}`;
      if (w) {
        w.opener = null;
        w.location.href = url;
      } else {
        window.location.href = url;
      }
      // Otwarcie PDF = materiał ukończony → odśwież znaczniki (i ewentualnie odblokuj kolejny moduł).
      if (!d.done && !course?.preview) void refreshCourse();
    } catch (e) {
      w?.close();
      handleAuthError(e, tr().fileErr);
    }
  }

  function handleAuthError(e: unknown, fallback: string) {
    if (e instanceof ApiError && e.status === 401) {
      store.set(TOKEN_KEY, null);
      show('login');
      return;
    }
    if (e instanceof ApiError && e.status === 403) {
      store.set(TOKEN_KEY, null);
      show('login');
      msg($('#ca-login-form')!, e.message);
      return;
    }
    window.alert(e instanceof Error && e.message ? e.message : fallback);
  }

  // Gdy któryś film się koduje — co 60 s ciche odświeżenie listy (zaślepka sama zamieni się w film).
  let pendingTimer: number | undefined;
  function schedulePendingRefresh() {
    window.clearTimeout(pendingTimer);
    if (!allItems().some((i) => i.pending)) return;
    pendingTimer = window.setTimeout(async () => {
      if (current !== 'dashboard' || document.visibilityState !== 'visible') return schedulePendingRefresh();
      try {
        applyCourse(await api<CourseData>(`/member/courses/${slug}`, {}, true));
      } catch {
        /* błąd sieci — spróbujemy za chwilę */
      }
      schedulePendingRefresh();
    }, 60_000);
  }

  async function loadCourse(): Promise<void> {
    setLoading(tr().connecting);
    try {
      course = await api<CourseData>(`/member/courses/${slug}`, {}, true);
      show('dashboard');
      renderDashboard();
      schedulePendingRefresh();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        store.set(TOKEN_KEY, null);
        show('login');
      } else if (err.status === 403) {
        store.set(TOKEN_KEY, null);
        show('login');
        msg($('#ca-login-form')!, err.message);
      } else if (err.status === 404) {
        show('notfound');
      } else {
        show('login');
        msg($('#ca-login-form')!, err.message || tr().network);
      }
    }
  }

  // ── Formularze ──
  function bindForm(id: string, handler: (form: HTMLFormElement, data: FormData) => Promise<void>) {
    const form = $(`#${id}`) as HTMLFormElement | null;
    if (!form) return;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (btn?.disabled) return;
      if (btn) btn.disabled = true;
      msg(form, null);
      try {
        await handler(form, new FormData(form));
      } catch (e) {
        msg(form, e instanceof Error ? e.message : tr().loginFail);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  bindForm('ca-login-form', async (form, fd) => {
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    if (!email || !password) return msg(form, tr().fill);
    const r = await api<{ accessToken: string }>('/member/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, slug }),
    });
    store.set(TOKEN_KEY, r.accessToken);
    (form.querySelector('input[name="password"]') as HTMLInputElement).value = '';
    await loadCourse();
  });

  bindForm('ca-forgot-form', async (form, fd) => {
    const email = String(fd.get('email') ?? '').trim();
    if (!email) return;
    await api('/member/auth/forgot', { method: 'POST', body: JSON.stringify({ email, slug }) });
    msg(form, tr().forgotSent, true);
  });

  bindForm('ca-setpw-form', async (form, fd) => {
    const p1 = String(fd.get('password') ?? '');
    const p2 = String(fd.get('password2') ?? '');
    if (p1.length < 8) return msg(form, tr().pwShort);
    if (p1 !== p2) return msg(form, tr().pwMismatch);
    const token = new URLSearchParams(location.search).get('haslo') ?? '';
    const r = await api<{ accessToken: string }>('/member/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ token, password: p1 }),
    });
    store.set(TOKEN_KEY, r.accessToken);
    history.replaceState(null, '', location.pathname);
    await loadCourse();
  });

  root.querySelectorAll<HTMLElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      const target = b.dataset.go as View;
      // Przenieś wpisany e-mail między formularzami.
      const from = root.querySelector<HTMLInputElement>(`[data-view="${current}"] input[name="email"]`);
      const to = root.querySelector<HTMLInputElement>(`[data-view="${target}"] input[name="email"]`);
      if (from && to && from.value) to.value = from.value;
      show(target);
    }),
  );

  $('#ca-logout')?.addEventListener('click', () => {
    closePlayer();
    store.set(TOKEN_KEY, null);
    course = null;
    show('login');
  });

  // ── Start ──
  async function start() {
    // Starszy, lokalny wybór z panelu formacji przenosimy do wspólnej pamięci języka.
    const legacy = store.get(LANG_KEY);
    if ((legacy === 'pl' || legacy === 'en') && !getSavedLang()) saveLang(legacy);
    store.set(LANG_KEY, null);
    // ?lang= → zapamiętany wybór → język przeglądarki (PL → PL, każdy inny → EN; IT tu jeszcze nie ma).
    setLang(resolveLang(['pl', 'en']) === 'pl' ? 'pl' : 'en');

    if (!slug) {
      show('list');
      return;
    }

    // Podgląd admina: token w #fragmencie (nie trafia do serwera ani historii) → od razu treść, także szkicu.
    const hash = new URLSearchParams(location.hash.slice(1));
    const previewToken = hash.get('podglad');
    if (previewToken) {
      store.set(TOKEN_KEY, previewToken);
      history.replaceState(null, '', location.pathname + location.search);
      await loadCourse();
      return;
    }

    // Strona-fallback (/formacja/index.html przez regułę Rewrite) nie ma danych z buildu — dociągamy je.
    if (!root.dataset.slug) {
      setLoading(tr().connecting);
      try {
        const pub = await api<{ slug?: string; title?: LangText; description?: LangText; status?: string; redirectTo?: string }>(
          `/courses/public/${slug}`,
        );
        if (pub.redirectTo) {
          location.replace(`/formacja/${pub.redirectTo}/${location.search}`);
          return;
        }
        headerData = { title: pub.title, description: pub.description };
        renderHeader();
        if (pub.status === 'ARCHIVED') {
          show('closed');
          return;
        }
      } catch (e) {
        if ((e as ApiError).status === 404) {
          // Szkic nie jest publiczny — ale zapamiętany podgląd admina go otworzy (loadCourse sam pokaże 404, gdy brak dostępu).
          if (store.get(TOKEN_KEY)) await loadCourse();
          else show('notfound');
          return;
        }
      }
    } else if (root.dataset.status === 'ARCHIVED') {
      show('closed');
      return;
    }

    const pwToken = new URLSearchParams(location.search).get('haslo');
    if (pwToken) {
      show('setpw');
      // Zapis kliknięcia linku z maila + sprawdzenie ważności (wygasły → od razu komunikat).
      api<{ valid: boolean }>('/member/auth/link-open', { method: 'POST', body: JSON.stringify({ token: pwToken }) })
        .then((r) => {
          if (!r.valid) {
            history.replaceState(null, '', location.pathname);
            show('forgot');
            msg($('#ca-forgot-form')!, tr().linkExpired);
          }
        })
        .catch(() => undefined);
      return;
    }
    if (store.get(TOKEN_KEY)) await loadCourse();
    else show('login');
  }

  void start();
}
