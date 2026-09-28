// Panel kursanta „Formacja online" (icpemission.pl/formacja/<slug>) — aplikacja kliencka bez frameworka.
// Widoki: loading → login | setpw (link z maila ?haslo=) | forgot → dashboard (filmy + PDF).
// Treści z panelu admina wstawiamy WYŁĄCZNIE przez textContent (bez innerHTML).

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
}
interface CourseData {
  slug: string;
  title: LangText;
  description: LangText;
  member: { firstName: string; email: string } | null;
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
  let playing: { id: string; expiresAt: number } | null = null;

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
  const fmtDur = (s: number | null) => {
    if (!s) return '';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };

  // ── Język ──
  function setLang(l: Lang) {
    lang = l;
    root.setAttribute('data-lang', l);
    document.documentElement.lang = l;
    store.set(LANG_KEY, l);
    if (course && current === 'dashboard') renderDashboard();
    renderHeader();
  }
  root.querySelectorAll<HTMLButtonElement>('[data-langbtn]').forEach((b) =>
    b.addEventListener('click', () => setLang((b.dataset.langbtn as Lang) || 'pl')),
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
    if (hello) hello.textContent = tr().hello(course.member?.firstName ?? '');
    const videos = course.items.filter((i) => i.kind === 'VIDEO');
    const docs = course.items.filter((i) => i.kind === 'PDF');
    const vBox = $('#ca-videos')!;
    const dBox = $('#ca-docs')!;
    vBox.replaceChildren();
    dBox.replaceChildren();
    $('#ca-videos-h')!.hidden = videos.length === 0;
    vBox.hidden = videos.length === 0;
    $('#ca-docs-h')!.hidden = docs.length === 0;
    dBox.hidden = docs.length === 0;
    $('#ca-empty')!.hidden = course.items.length > 0;

    for (const v of videos) {
      const card = el('button', 'ca-video');
      card.type = 'button';
      const thumb = el('div', 'ca-thumb');
      if (v.thumbnailUrl) thumb.style.backgroundImage = `url("${encodeURI(v.thumbnailUrl)}")`;
      thumb.append(el('span', 'ca-play'));
      if (v.durationSec) thumb.append(el('span', 'ca-dur', fmtDur(v.durationSec)));
      const body = el('div', 'ca-video-body');
      body.append(el('div', 'ca-item-title', pick(v.title)));
      const desc = pick(v.description);
      if (desc) body.append(el('p', 'ca-item-desc', desc));
      card.append(thumb, body);
      card.addEventListener('click', () => void play(v));
      vBox.append(card);
    }

    for (const d of docs) {
      const row = el('div', 'ca-item');
      row.append(el('div', 'ca-pdf-ico', tr().pdf));
      const main = el('div', 'ca-item-main');
      main.append(el('div', 'ca-item-title', pick(d.title)));
      const desc = pick(d.description);
      if (desc) main.append(el('p', 'ca-item-desc', desc));
      const actions = el('div', 'ca-item-actions');
      const open = el('button', 'ca-btn ca-btn-light', tr().open);
      open.type = 'button';
      open.addEventListener('click', () => void openFile(d, false));
      const dl = el('button', 'ca-btn ca-btn-light', tr().download);
      dl.type = 'button';
      dl.addEventListener('click', () => void openFile(d, true));
      actions.append(open, dl);
      row.append(main, actions);
      dBox.append(row);
    }
  }

  async function play(v: Item) {
    try {
      const r = await api<{ embedUrl: string; expiresAt: string }>(
        `/member/courses/${slug}/items/${v.id}/play`,
        {},
        true,
      );
      const player = $('#ca-player')!;
      const frame = $('#ca-iframe') as HTMLIFrameElement;
      frame.src = r.embedUrl;
      frame.title = pick(v.title) || tr().video;
      $('#ca-player-title')!.textContent = pick(v.title);
      player.hidden = false;
      playing = { id: v.id, expiresAt: Date.parse(r.expiresAt) };
      player.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      handleAuthError(e, tr().playErr);
    }
  }
  $('#ca-player-close')?.addEventListener('click', () => {
    ($('#ca-iframe') as HTMLIFrameElement).src = 'about:blank';
    $('#ca-player')!.hidden = true;
    playing = null;
  });
  // Podpisany link do wideo wygasa po kilku godzinach — przy powrocie do karty odśwież, jeśli trzeba.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playing && Date.now() > playing.expiresAt - 60_000 && course) {
      const it = course.items.find((i) => i.id === playing!.id);
      if (it) void play(it);
    }
  });

  async function openFile(d: Item, download: boolean) {
    // Okno otwieramy synchronicznie (inaczej blokada wyskakujących okien), adres ustawiamy po odpowiedzi API.
    const w = download ? null : window.open('about:blank', '_blank');
    try {
      const r = await api<{ path: string; downloadPath: string }>(`/member/courses/${slug}/items/${d.id}/file`, {}, true);
      const url = `${API}${download ? r.downloadPath : r.path}`;
      if (w) {
        w.opener = null;
        w.location.href = url;
      } else {
        window.location.href = url;
      }
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

  async function loadCourse(): Promise<void> {
    setLoading(tr().connecting);
    try {
      course = await api<CourseData>(`/member/courses/${slug}`, {}, true);
      show('dashboard');
      renderDashboard();
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
    store.set(TOKEN_KEY, null);
    course = null;
    ($('#ca-iframe') as HTMLIFrameElement).src = 'about:blank';
    $('#ca-player')!.hidden = true;
    show('login');
  });

  // ── Start ──
  async function start() {
    const saved = store.get(LANG_KEY);
    setLang(saved === 'en' ? 'en' : 'pl');

    if (!slug) {
      show('list');
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
          show('notfound');
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
      return;
    }
    if (store.get(TOKEN_KEY)) await loadCourse();
    else show('login');
  }

  void start();
}
