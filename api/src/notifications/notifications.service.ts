import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { formatMoney, leaderDepositSplit } from '../shared';

/** Podsumowanie noclegu w mailach (dane przekazywane przez RegistrationsService). */
export interface MailAccommodation {
  /** event oferuje noclegi (są pokoje i co najmniej 1 noc) */
  offered: boolean;
  /** wybrane pokoje: nazwa (w języku gościa) + liczba osób */
  rooms: Array<{ name: string; people: number }>;
  /** ile osób bez noclegu */
  withoutRoom: number;
  /** liczba nocy */
  nights: number;
}

/**
 * Język maili do gości: PL, EN, KO (koreański), ZH (chiński uproszczony).
 * Pozostałe języki gościa (np. IT) dostają wersję angielską.
 * Terminologia katolicka: KO — 하느님/주님, 미사, 피정, 본당; ZH — 天主, 弥撒, 避静, 堂区.
 */
type MailLang = 'pl' | 'en' | 'ko' | 'zh';
const mailLangOf = (locale: string | undefined | null): MailLang =>
  locale === 'ko' || locale === 'zh' || locale === 'pl' ? locale : locale ? 'en' : 'pl';
/** Maile tylko PL/EN (np. formacja online): każdy język poza PL → angielski. */
const mailEn = (locale: string | undefined | null): boolean => !!locale && locale !== 'pl';

/** Podpis maila w danym języku. */
function signature(lang: MailLang): string[] {
  switch (lang) {
    case 'en': return ['God bless,', 'ICPE Mission Poland'];
    case 'ko': return ['주님의 축복을 빕니다.', 'ICPE Mission 폴란드'];
    case 'zh': return ['愿天主祝福您！', 'ICPE Mission 波兰'];
    default: return ['Szczęść Boże,', 'ICPE Mission Polska'];
  }
}

/** Powitanie: KO po katolicku „찬미 예수님!” (z imieniem: „길동님, 찬미 예수님!”). */
function greetingLine(lang: MailLang, name = ''): string {
  const n = name.trim();
  switch (lang) {
    case 'en': return n ? `${n},` : 'Hello,';
    case 'ko': return n ? `${n}님, 찬미 예수님!` : '찬미 예수님!';
    case 'zh': return n ? `${n}，您好！` : '您好！';
    default: return n ? `${n},` : 'Dzień dobry,';
  }
}

/** Wybór tekstu wg języka maila. */
const L = <T,>(lang: MailLang, v: Record<MailLang, T>): T => v[lang];

/** Wiersz „Dodatki” w potwierdzeniu (zamówione dodatki z limitem, np. dostawka); pusty, gdy ich nie ma. */
function addonMailLines(addons: unknown, lang: MailLang): string[] {
  const list = (Array.isArray(addons) ? addons : []) as Array<{ name?: unknown; qty?: unknown }>;
  const items = list
    .filter((a) => a && typeof a.name === 'string' && a.name && Number(a.qty) > 0)
    .map((a) => (Number(a.qty) > 1 ? `${a.name} × ${Number(a.qty)}` : String(a.name)));
  if (!items.length) return [];
  const joined = items.join(lang === 'zh' ? '，' : ', ');
  return [L(lang, {
    pl: `Dodatki: ${joined}. Liczba sztuk jest ograniczona — organizator potwierdzi je po przydziale pokoi.`,
    en: `Extras: ${joined}. Availability is limited — the organiser will confirm them once rooms have been allocated.`,
    ko: `추가 항목: ${joined}. 수량이 한정되어 있어 객실 배정 후 주최 측에서 확정해 드립니다.`,
    zh: `附加项目：${joined}。数量有限，主办方将在分配房间后予以确认。`,
  })];
}

/** Linie o noclegu do maila (puste, gdy event nie oferuje noclegów). */
function accommodationLines(acc: MailAccommodation | undefined, lang: MailLang): string[] {
  if (!acc || !acc.offered) return [];
  if (acc.rooms.length === 0) {
    return [L(lang, { pl: 'Nocleg: bez noclegu.', en: 'Accommodation: not needed.', ko: '숙박: 필요 없음.', zh: '住宿：不需要。' })];
  }
  const people = (n: number) =>
    L(lang, { pl: `${n} os.`, en: `${n} ${n === 1 ? 'person' : 'people'}`, ko: `${n}명`, zh: `${n}人` });
  const k = acc.nights;
  const nights = L(lang, {
    pl: `${k} ${k === 1 ? 'noc' : k < 5 ? 'noce' : 'nocy'}`,
    en: `${k} ${k === 1 ? 'night' : 'nights'}`,
    ko: `${k}박`,
    zh: `${k}晚`,
  });
  const list = acc.rooms
    .map((r) => (lang === 'zh' ? `${r.name}（${people(r.people)}）` : `${r.name} (${people(r.people)})`))
    .join(lang === 'zh' ? '，' : ', ');
  const lines = [L(lang, {
    pl: `Nocleg (${nights}): ${list}.`,
    en: `Accommodation (${nights}): ${list}.`,
    ko: `숙박 (${nights}): ${list}.`,
    zh: `住宿（${nights}）：${list}。`,
  })];
  if (acc.withoutRoom > 0) {
    const w = people(acc.withoutRoom);
    lines.push(L(lang, { pl: `Bez noclegu: ${w}`, en: `Without accommodation: ${w}.`, ko: `숙박 없음: ${w}.`, zh: `不住宿：${w}。` }));
  }
  return lines;
}

/** Akapit o płatności: przy gotówce — kwota, którą trzeba mieć przy sobie na rejestracji. */
function paymentLines(method: unknown, amount: string, lang: MailLang, total: number, currency = 'PLN', leaderPct?: number): string[] {
  if (total <= 0) return [];
  const amountLine = L(lang, { pl: `Kwota: ${amount}.`, en: `Amount: ${amount}.`, ko: `금액: ${amount}.`, zh: `金额：${amount}。` });
  if (method === 'LEADER_DEPOSIT') {
    // Zaliczka u lidera wspólnoty + reszta gotówką przy rejestracji.
    const sp = leaderDepositSplit(total, { leaderDepositPct: leaderPct });
    const f = (n: number) => formatMoney(n, currency as 'PLN' | 'EUR' | 'USD', lang);
    return [amountLine, ...L(lang, {
      pl: [`Płatność: zaliczkę ${f(sp.deposit)} (${sp.pct}%) przekaż liderowi swojej wspólnoty.`, `Pozostałe ${f(sp.rest)} prosimy mieć przy sobie gotówką przy rejestracji na miejscu.`],
      en: [`Payment: please hand a deposit of ${f(sp.deposit)} (${sp.pct}%) to your community leader.`, `Please bring the remaining ${f(sp.rest)} in cash to the registration desk.`],
      ko: [`결제: 예약금 ${f(sp.deposit)}(${sp.pct}%)를 공동체 리더에게 전달해 주세요.`, `나머지 ${f(sp.rest)}는 현장 접수처에서 현금으로 결제해 주세요.`],
      zh: [`付款方式：请将定金 ${f(sp.deposit)}（${sp.pct}%）交给您的团体负责人。`, `其余 ${f(sp.rest)} 请在现场报到处以现金支付。`],
    })];
  }
  if (method === 'CASH') {
    return L(lang, {
      pl: [`Płatność: gotówką przy rejestracji na miejscu.`, `Prosimy mieć przy sobie ${amount} gotówką (najlepiej odliczoną kwotę).`],
      en: [`Payment: cash at registration desk.`, `Please bring ${amount} in cash (the exact amount if possible).`],
      ko: ['결제: 현장 접수 시 현금 결제.', `준비하실 현금: ${amount} (가능하면 정확한 금액으로).`],
      zh: ['付款方式：现场报到时以现金支付。', `请携带现金 ${amount}（尽量准备零钱）。`],
    });
  }
  if (method === 'BANK_TRANSFER') {
    return [amountLine, L(lang, {
      pl: 'Płatność: przelew bankowy — prosimy o dokonanie przelewu w podanym terminie.',
      en: 'Payment: bank transfer — please make the transfer by the given date.',
      ko: '결제: 계좌 이체 — 기한 내에 이체해 주세요.',
      zh: '付款方式：银行转账——请在规定期限内完成转账。',
    })];
  }
  return [amountLine, L(lang, {
    pl: 'Płatność: online — zostanie potwierdzona automatycznie.',
    en: 'Payment: online — it will be confirmed automatically.',
    ko: '결제: 온라인 — 자동으로 확인됩니다.',
    zh: '付款方式：在线支付——将自动确认。',
  })];
}

/** Data `YYYY-MM-DD` → zapis czytelny w języku maila (bez przesunięć stref czasowych). */
function mailDate(date: string, lang: MailLang): string {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y || !m || !d) return String(date);
  const locale = lang === 'pl' ? 'pl-PL' : lang === 'ko' ? 'ko-KR' : lang === 'zh' ? 'zh-CN' : 'en-GB';
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Harmonogram wpłat w mailu potwierdzającym (gdy event ma plan rat). */
function scheduleLines(schedule: unknown, currency: string, lang: MailLang): string[] {
  const items = (Array.isArray(schedule) ? schedule : []) as Array<{ label?: string; dueDate: string; amount: number; atRegistration?: boolean }>;
  if (items.length === 0) return [];
  const f = (n: number) => formatMoney(n, currency as 'PLN' | 'EUR' | 'USD', lang);
  return [
    '',
    L(lang, { pl: 'Harmonogram wpłat:', en: 'Payment schedule:', ko: '납부 일정:', zh: '付款时间表：' }),
    ...items.map((it) => {
      const name = it.label ? `${it.label}: ` : '';
      return it.atRegistration
        ? L(lang, {
            pl: `• ${name}${f(it.amount)} — przy rejestracji`,
            en: `• ${name}${f(it.amount)} — on registration`,
            ko: `• ${name}${f(it.amount)} — 신청 시`,
            zh: `• ${name}${f(it.amount)} — 报名时`,
          })
        : L(lang, {
            pl: `• ${name}${f(it.amount)} — do ${mailDate(it.dueDate, lang)}`,
            en: `• ${name}${f(it.amount)} — by ${mailDate(it.dueDate, lang)}`,
            ko: `• ${name}${f(it.amount)} — ${mailDate(it.dueDate, lang)}까지`,
            zh: `• ${name}${f(it.amount)} — ${mailDate(it.dueDate, lang)}前`,
          });
    }),
  ];
}

function buttonMail(intro: string[], button: { label: string; href: string } | null, outro: string[], lang: MailLang = 'pl'): { text: string; html: string } {
  const text = [...intro, ...(button ? [button.href, ''] : []), ...outro].join('\n');
  const p = (l: string) => (l === '' ? '<br/>' : `<p style="margin:0 0 6px">${esc(l)}</p>`);
  const btn = button
    ? `<p style="margin:18px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#C0603C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600">${esc(button.label)}</a></p>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">${esc(L(lang, {
          pl: 'Gdyby przycisk nie działał, skopiuj link:',
          en: "If the button doesn't work, copy this link:",
          ko: '버튼이 작동하지 않으면 이 링크를 복사해 주세요:',
          zh: '如果按钮无法使用，请复制此链接：',
        }))} ${esc(button.href)}</p>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">
        ${intro.map(p).join('')}
        ${btn}
        ${outro.map(p).join('')}
      </div>`;
  return { text, html };
}

const SIGNATURE = ['Szczęść Boże,', 'ICPE Mission Polska'];

/**
 * Mail z zaproszeniem — wspólny dla zaproszeń od admina (INVITATION) i od uczestnika
 * (GUEST_INVITATION). Personalizacja z panelu (pola zaproszenia):
 *  - `salutation` — własny zwrot zamiast „Imię,", np. „Szanowny Księże Biskupie,",
 *  - `note` — dodatkowe akapity od organizatora (wstawiane po terminie i miejscu),
 *  - `subject` — własny temat,
 *  - `formal` — forma grzecznościowa (bez „Ty"/„Cię") dla ważnych gości.
 * `mode`: CONFIRM (event na zaproszenie) albo REGISTER (zwykły event — rejestracja w lejku).
 */
function inviteEmail(d: Record<string, unknown>, guest: boolean): { subject: string; text: string; html: string } {
  const title = String(d.eventTitle ?? 'wydarzenie');
  const name = String(d.firstName ?? '').trim();
  const when = String(d.when ?? '');
  const where = String(d.location ?? '');
  const inviter = String(d.inviterName ?? '').trim() || 'Uczestnik';
  const register = d.mode === 'REGISTER';
  const formal = d.formal === true;
  const salutation = String(d.salutation ?? '').trim();
  const note = String(d.note ?? '').replace(/\r\n/g, '\n').trim();
  const customSubject = String(d.subject ?? '').trim();

  const greeting = salutation || (name ? `${name},` : formal ? 'Szanowni Państwo,' : 'Dzień dobry,');
  const inviteLine = guest
    ? formal
      ? `${inviter} ma przyjemność zaprosić na: ${title}.`
      : `${inviter} zaprasza Cię na: ${title}.`
    : formal
      ? `mamy zaszczyt zaprosić na: ${title}.`
      : `zapraszamy Cię na: ${title}.`;
  const instruction = register
    ? formal
      ? 'Rejestracja odbywa się przez osobisty link — dane są już wpisane w formularz:'
      : 'Zarejestrujesz się swoim osobistym linkiem — Twoje dane są już wpisane w formularz:'
    : formal
      ? 'Wydarzenie ma charakter zamknięty. Udział prosimy potwierdzić za pomocą osobistego linku:'
      : guest
        ? 'Udział potwierdzisz swoim osobistym linkiem:'
        : 'To wydarzenie tylko dla zaproszonych gości. Udział potwierdzisz swoim osobistym linkiem:';
  const outro = [
    formal ? 'Link jest imienny — prosimy go nie przekazywać.' : 'Prosimy nie przekazywać linku dalej — jest przypisany do Ciebie.',
    ...(guest
      ? [formal ? 'Jeśli wiadomość trafiła do Państwa przez pomyłkę, prosimy ją zignorować.' : 'Jeśli nie znasz osoby zapraszającej, zignoruj tę wiadomość.']
      : []),
    '',
    ...SIGNATURE,
  ];

  const intro = [greeting, '', inviteLine];
  if (when) intro.push(`Termin: ${when}.`);
  if (where) intro.push(`Miejsce: ${where}.`);
  if (note) intro.push('', ...note.split('\n').map((l) => l.trim()));
  intro.push('', instruction);

  const subject =
    customSubject || (guest && !formal ? `${inviter} zaprasza Cię — ${title}` : `Zaproszenie — ${title}`);
  const { text, html } = buttonMail(
    // Podwójne puste linie (np. z notatki) zwijamy do jednej — w HTML dawałyby dziurę.
    intro.filter((l, i, arr) => l !== '' || arr[i - 1] !== ''),
    { label: register ? 'Zarejestruj się' : 'Potwierdzam udział', href: String(d.link ?? '') },
    outro,
  );
  return { subject, text, html };
}

/** „1 rok", „2 lata", „5 lat", „12 lat", „22 lata" — polska odmiana wieku. */
export function lat(n: number): string {
  const v = Math.abs(Math.round(n));
  if (v === 1) return '1 rok';
  const d = v % 10;
  const dd = v % 100;
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return `${v} lata`;
  return `${v} lat`;
}

/**
 * Mail „udział potwierdzony" dla osób/rodzin dodanych przez organizatora (INVITE_PRECONFIRMED).
 * Trzy warianty gramatyczne: Ty (jedna osoba), Wy (małżeństwo/rodzina), Państwo (forma grzecznościowa).
 * `reminder` — wariant „Przypomnij o diecie". Personalizacja z panelu jak w zaproszeniu.
 * W mailu NIE ma linków zmieniających dane (skanery poczty klikają linki) — tylko link do strony /i/:token.
 */
function preconfirmedEmail(d: Record<string, unknown>): { subject: string; text: string; html: string } {
  const title = String(d.eventTitle ?? 'wydarzenie');
  const name = String(d.firstName ?? '').trim();
  const spouseName = String(d.spouseFirstName ?? '').trim();
  const when = String(d.when ?? '');
  const where = String(d.location ?? '');
  const formal = d.formal === true;
  const household = d.household === true;
  const reminder = d.reminder === true;
  const salutation = String(d.salutation ?? '').trim();
  const note = String(d.note ?? '').replace(/\r\n/g, '\n').trim();
  const customSubject = String(d.subject ?? '').trim();
  const guestLink = String(d.guestInviteLink ?? '').trim();
  const maxGuests = Number(d.maxGuests ?? 0);
  const privacyUrl = String(d.privacyUrl ?? '').trim();
  const people = (Array.isArray(d.people) ? d.people : []) as Array<{ name?: string; age?: number }>;
  // Forma: P = Państwo, W = Wy, T = Ty.
  const f: 'P' | 'W' | 'T' = formal ? 'P' : household ? 'W' : 'T';
  const pick = (t: string, w: string, p: string) => (f === 'P' ? p : f === 'W' ? w : t);

  const greeting =
    salutation ||
    (f === 'P'
      ? household
        ? 'Szanowni Państwo,'
        : 'Dzień dobry,'
      : name
        ? spouseName
          ? `${name} i ${spouseName},`
          : `${name},`
        : 'Dzień dobry,');

  const firstLine = reminder
    ? pick(
        `przypominamy, że Twój udział w: ${title} jest potwierdzony.`,
        `przypominamy, że Wasz udział w: ${title} jest potwierdzony.`,
        `uprzejmie przypominamy, że udział w: ${title} jest potwierdzony.`,
      )
    : pick(
        `z radością potwierdzamy Twój udział w: ${title}.`,
        `z radością potwierdzamy Wasz udział w: ${title}.`,
        `mamy przyjemność potwierdzić Państwa udział w: ${title}.`,
      );

  const peopleLine = people
    .map((p) => `${String(p.name ?? '').trim() || 'Gość'}${typeof p.age === 'number' ? ` (${lat(p.age)})` : ''}`)
    .join(', ');

  const ask = reminder
    ? pick(
        'Przygotowujemy posiłki i nie mamy jeszcze od Ciebie informacji o wymaganiach żywieniowych. Daj nam znać — także wtedy, gdy nie masz żadnych (to jedno kliknięcie):',
        'Przygotowujemy posiłki i nie mamy jeszcze od Was informacji o wymaganiach żywieniowych. Dajcie nam znać — także wtedy, gdy nikt z Was ich nie ma (to jedno kliknięcie):',
        'Przygotowujemy posiłki — uprzejmie prosimy o informację o ewentualnych wymaganiach żywieniowych lub alergiach (także o tym, że ich nie ma):',
      )
    : pick(
        'Nie musisz niczego potwierdzać. Jeśli masz wymagania żywieniowe lub alergie, daj nam znać — zajmie to chwilę:',
        'Nie musicie niczego potwierdzać. Jeśli ktoś z Was ma wymagania żywieniowe lub alergie, dajcie nam znać — zajmie to chwilę:',
        'Nie trzeba niczego potwierdzać. Uprzejmie prosimy o informację o ewentualnych wymaganiach żywieniowych lub alergiach:',
      );

  const intro = [greeting, '', firstLine];
  if (when) intro.push(`Termin: ${when}.`);
  if (where) intro.push(`Miejsce: ${where}.`);
  if (peopleLine) intro.push('', `Na liście gości zapisaliśmy: ${peopleLine}.`);
  if (note) intro.push('', ...note.split('\n').map((l) => l.trim()));
  intro.push('', ask);

  const guestCount = maxGuests === 1 ? 'jedną osobę' : `do ${maxGuests} osób`;
  const outro = [
    pick(
      'Pod tym samym linkiem sprawdzisz swoje zgłoszenie i dasz znać, jeśli coś się zmieni. Link jest przypisany do Ciebie — prosimy go nie przekazywać.',
      'Pod tym samym linkiem sprawdzicie swoje zgłoszenie i dacie znać, jeśli coś się zmieni. Link jest przypisany do Was — prosimy go nie przekazywać.',
      'Pod tym samym linkiem można sprawdzić zgłoszenie i poinformować nas o zmianach. Link jest imienny — prosimy go nie przekazywać.',
    ),
    ...(guestLink && maxGuests > 0
      ? [
          '',
          pick(
            `Możesz też zaprosić ${guestCount} — każda dostanie od nas imienne zaproszenie: ${guestLink}`,
            `Możecie też zaprosić ${guestCount} — każda dostanie od nas imienne zaproszenie: ${guestLink}`,
            `Istnieje też możliwość zaproszenia ${guestCount} — każda otrzyma imienne zaproszenie: ${guestLink}`,
          ),
        ]
      : []),
    '',
    pick(
      'Twoje dane wpisał organizator na potrzeby przygotowania wydarzenia (lista gości, posiłki). W sprawie swoich danych możesz się z nami skontaktować.',
      'Wasze dane wpisał organizator na potrzeby przygotowania wydarzenia (lista gości, posiłki). W sprawie swoich danych możecie się z nami skontaktować.',
      'Dane zostały wpisane przez organizatora na potrzeby przygotowania wydarzenia (lista gości, posiłki). W sprawie danych prosimy o kontakt z organizatorem.',
    ) + (privacyUrl ? ` Szczegóły: ${privacyUrl}` : ''),
    '',
    ...SIGNATURE,
  ];

  const subject =
    customSubject ||
    (reminder
      ? `Przypomnienie: wymagania żywieniowe — ${title}`
      : pick(`Twój udział jest potwierdzony — ${title}`, `Wasz udział jest potwierdzony — ${title}`, `Potwierdzenie udziału — ${title}`));
  const { text, html } = buttonMail(
    intro.filter((l, i, arr) => l !== '' || arr[i - 1] !== ''),
    { label: 'Podaj wymagania żywieniowe', href: String(d.link ?? '') },
    outro,
  );
  return { subject, text, html };
}

/** Escapowanie treści wstawianej do HTML-a maila (tytuły eventów bywają z `&`, `<`). */
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export type MailProvider = 'resend' | 'smtp' | 'log';

/** Wynik wysyłki: status + ewentualny komunikat błędu (do pokazania adminowi). */
export interface MailResult {
  status: 'SENT' | 'FAILED' | 'LOGGED';
  error?: string;
}

export interface MailPayload {
  to: string;
  type: string;
  locale: string;
  data: Record<string, unknown>;
  registrationId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Mail');
  private readonly mailMode: MailProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transporter: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mailMode = this.resolveProvider();
    this.logger.log(`Dostawca maili: ${this.mailMode}`);
  }

  /**
   * Który dostawca wysyła maile:
   *  - MAIL_MODE=resend | smtp | log — jawny wybór,
   *  - MAIL_MODE puste, ale jest RESEND_API_KEY → resend (wystarczy wkleić klucz na Renderze),
   *  - inaczej log (nic nie wychodzi — tylko wpis w logach).
   * Literówka w MAIL_MODE nie może po cichu wyłączyć wysyłki, więc nieznana wartość
   * traktowana jest jak puste pole (i logowana).
   */
  private resolveProvider(): MailProvider {
    const raw = (this.config.get<string>('MAIL_MODE') ?? '').trim().toLowerCase();
    const hasResend = !!(this.config.get<string>('RESEND_API_KEY') ?? '').trim();
    if (raw === 'resend' || raw === 'smtp' || raw === 'log') return raw;
    if (raw) this.logger.warn(`Nieznany MAIL_MODE="${raw}" — ignoruję`);
    return hasResend ? 'resend' : 'log';
  }

  private fromAddress(): string {
    return (
      (this.config.get<string>('MAIL_FROM') ?? '').trim() || 'ICPE Mission <rejestracja@icpemission.pl>'
    );
  }

  private replyTo(): string | undefined {
    return (this.config.get<string>('MAIL_REPLY_TO') ?? '').trim() || undefined;
  }

  /**
   * Wysyłka przez Resend (HTTP API, bez SDK — Node 20 ma wbudowany fetch).
   * Zwraca id wiadomości albo rzuca błąd z komunikatem Resenda (np. niezweryfikowana domena).
   */
  private async sendViaResend(msg: { to: string; subject: string; text: string; html: string }): Promise<string> {
    const key = (this.config.get<string>('RESEND_API_KEY') ?? '').trim();
    if (!key) throw new Error('Brak RESEND_API_KEY w konfiguracji API');
    const body: Record<string, unknown> = {
      from: this.fromAddress(),
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    };
    const reply = this.replyTo();
    if (reply) body.reply_to = reply;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok) {
        throw new Error(`Resend ${res.status}: ${data.message ?? data.name ?? 'nieznany błąd'}`);
      }
      return data.id ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  /** Leniwie tworzy transport SMTP z ENV (tylko gdy MAIL_MODE=smtp). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getTransporter(): Promise<any> {
    if (this.transporter) return this.transporter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nm: any = await import('nodemailer');
    const factory = nm.createTransport ?? nm.default?.createTransport;
    const port = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    this.transporter = factory({
      host: this.config.get<string>('SMTP_HOST'),
      port,
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true' || port === 465,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
    return this.transporter;
  }

  /** Buduje temat i treść maila na podstawie typu i danych. */
  /** Podgląd maila (temat + HTML) bez wysyłki — używane przez „Podgląd" w panelu. */
  render(payload: MailPayload): { subject: string; text: string; html: string } {
    return this.buildEmail(payload);
  }

  private buildEmail(payload: MailPayload): { subject: string; text: string; html: string } {
    const d = payload.data as Record<string, unknown>;
    const money = (v: unknown, cur: unknown) => `${Number(v ?? 0)} ${String(cur ?? 'PLN')}`;
    const payLabel = (m: unknown) =>
      m === 'ONLINE' ? 'płatność online' : m === 'CASH' ? 'gotówka na miejscu' : m === 'LEADER_DEPOSIT' ? 'zaliczka u lidera + reszta gotówką' : 'przelew bankowy';

    if (payload.type === 'CONFIRMATION') {
      const lang = mailLangOf(payload.locale);
      const title = String(d.eventTitle ?? L(lang, { pl: 'wydarzenie', en: 'the event', ko: '행사', zh: '活动' }));
      const total = Number(d.totalPrice ?? 0);
      const amount = formatMoney(total, (String(d.currency ?? 'PLN') as 'PLN' | 'EUR' | 'USD'), lang);
      const acc = d.accommodation as MailAccommodation | undefined;
      const manageLink = String(d.manageLink ?? '');
      const statusLink = String(d.statusLink ?? '');
      const donation = Number(d.donation ?? 0) > 0 ? Number(d.donation) : 0;
      const donationAmount = formatMoney(donation, (String(d.currency ?? 'PLN') as 'PLN' | 'EUR' | 'USD'), lang);
      const sig = signature(lang);
      const subject = L(lang, {
        pl: `Potwierdzenie zgłoszenia — ${title}`,
        en: `Registration confirmed — ${title}`,
        ko: `신청 확인 — ${title}`,
        zh: `报名确认 — ${title}`,
      });
      const regNo = String(payload.registrationId ?? '');
      const lines = [
        greetingLine(lang),
        '',
        L(lang, {
          pl: `Dziękujemy za zgłoszenie na: ${title}.`,
          en: `Thank you for registering for: ${title}.`,
          ko: `${title}에 신청해 주셔서 감사합니다.`,
          zh: `感谢您报名参加：${title}。`,
        }),
        // Podziękowanie za dobrowolną darowiznę na dofinansowanie pobytu innych (jest już w kwocie łącznej).
        ...(donation > 0
          ? ['', L(lang, {
              pl: `Serdecznie dziękujemy za darowiznę w wysokości ${donationAmount}. Dzięki niej w wydarzeniu będzie mógł wziąć udział ktoś, kogo nie stać na pokrycie kosztów pobytu. Darowizna jest wliczona w kwotę zgłoszenia.`,
              en: `Thank you very much for your donation of ${donationAmount}. It will help someone who cannot afford the cost of the stay to take part in the event. The donation is included in your registration total.`,
              ko: `${donationAmount}의 후원금에 진심으로 감사드립니다. 이 후원금은 체류비를 부담하기 어려운 분이 행사에 참가할 수 있도록 돕는 데 쓰입니다. 후원금은 신청 금액에 포함되어 있습니다.`,
              zh: `衷心感谢您捐款 ${donationAmount}。这笔捐款将帮助无力承担住宿费用的人参加本次活动。捐款已计入报名总金额。`,
            })]
          : []),
        ...accommodationLines(acc, lang),
        ...addonMailLines(d.addons, lang),
        ...paymentLines(d.paymentMethod, amount, lang, total, String(d.currency ?? 'PLN'), d.leaderDepositPct as number | undefined),
        ...scheduleLines(d.schedule, String(d.currency ?? 'PLN'), lang),
        '',
        L(lang, { pl: `Numer zgłoszenia: ${regNo}`, en: `Registration number: ${regNo}`, ko: `신청 번호: ${regNo}`, zh: `报名编号：${regNo}` }),
        // Strona zgłoszenia: stan, harmonogram i wpłaty (a gdy reguła daje Tpay — także płatność online).
        ...(statusLink
          ? ['', d.payOnline && total > 0
              ? L(lang, {
                  pl: `Zapłać online (BLIK · szybki przelew) i sprawdź stan wpłat na stronie zgłoszenia: ${statusLink}`,
                  en: `Pay online and check your payments on your registration page: ${statusLink}`,
                  ko: `신청 페이지에서 온라인으로 결제하고 납부 내역을 확인하실 수 있습니다: ${statusLink}`,
                  zh: `您可以在报名页面在线付款并查看付款情况：${statusLink}`,
                })
              : L(lang, {
                  pl: `Stan zgłoszenia i wpłat sprawdzisz na stronie zgłoszenia: ${statusLink}`,
                  en: `You can check your registration and payments here: ${statusLink}`,
                  ko: `신청 및 납부 내역은 여기에서 확인하실 수 있습니다: ${statusLink}`,
                  zh: `您可以在这里查看报名和付款情况：${statusLink}`,
                })]
          : []),
      ];
      // Link do zmiany noclegu (gdy event oferuje noclegi) — jako tekst, bo przycisk bywa zajęty
      // przez „Zaproś gościa"; bez zaproszeń link dostaje własny przycisk.
      const manageText = acc?.offered && manageLink
        ? [L(lang, {
            pl: 'Zmiana planów? Nocleg możesz domówić lub zmienić tutaj:',
            en: 'Changed your mind about accommodation? You can add or change it here:',
            ko: '숙박 계획이 바뀌셨나요? 여기에서 숙박을 추가하거나 변경할 수 있습니다:',
            zh: '住宿计划有变？您可以在这里添加或更改住宿：',
          })]
        : [];
      const guestLink = String(d.guestInviteLink ?? '');
      if (manageText.length && !guestLink) {
        const { text, html } = buttonMail(
          [...lines, '', ...manageText],
          { label: L(lang, { pl: 'Zmień nocleg', en: 'Manage accommodation', ko: '숙박 변경', zh: '更改住宿' }), href: manageLink },
          sig,
          lang,
        );
        return { subject, text, html };
      }
      if (manageText.length) lines.push('', `${manageText[0]} ${manageLink}`);
      if (guestLink) {
        // Ścieżka „zaproś gościa" włączona dla eventu — link działa na podstawie tokenu zgłoszenia.
        const { text, html } = buttonMail(
          [...lines, '', L(lang, {
            pl: 'Chcesz zabrać kogoś ze sobą? Możesz zaprosić gościa — dostanie od nas zaproszenie z linkiem do rejestracji:',
            en: 'Would you like to bring someone along? You can invite a guest — we will send them an invitation with a registration link:',
            ko: '함께 오고 싶은 분이 있나요? 손님을 초대하시면 신청 링크가 담긴 초대장을 저희가 보내 드립니다:',
            zh: '想带朋友一起来吗？您可以邀请一位嘉宾——我们会给对方发送一封附有报名链接的邀请：',
          })],
          { label: L(lang, { pl: 'Zaproś gościa', en: 'Invite a guest', ko: '손님 초대하기', zh: '邀请嘉宾' }), href: guestLink },
          ['', ...sig],
          lang,
        );
        return { subject, text, html };
      }
      const { text, html } = buttonMail([...lines, '', ...sig], null, [], lang);
      return { subject, text, html };
    }

    if (payload.type === 'INVITATION' || payload.type === 'GUEST_INVITATION') {
      return inviteEmail(d, payload.type === 'GUEST_INVITATION');
    }

    if (payload.type === 'INVITE_PRECONFIRMED') {
      return preconfirmedEmail(d);
    }

    if (payload.type === 'INVITE_CONFIRMED') {
      // Potwierdzenie udziału w evencie na zaproszenie + link do zapraszania gości
      // (wysyłane tylko, gdy event ma włączoną ścieżkę „zaproś gościa").
      const title = String(d.eventTitle ?? 'wydarzenie');
      const name = String(d.firstName ?? '').trim();
      const max = Number(d.maxGuests ?? 0);
      const subject = `Potwierdzenie udziału — ${title}`;
      const { text, html } = buttonMail(
        [
          name ? `${name},` : 'Dzień dobry,',
          '',
          `dziękujemy za potwierdzenie udziału w: ${title}.`,
          d.when ? `Termin: ${String(d.when)}.` : '',
          '',
          `Możesz zaprosić ${max === 1 ? 'jedną osobę' : `do ${max} osób`} — każda dostanie od nas imienne zaproszenie:`,
        ],
        { label: 'Zaproś gościa', href: String(d.guestInviteLink ?? '') },
        [
          `Swoją odpowiedź (osoby, dieta) zmienisz tutaj: ${String(d.link ?? '')}`,
          '',
          ...SIGNATURE,
        ],
      );
      return { subject, text, html };
    }

    if (payload.type === 'GUEST_INVITE_LINK') {
      // Zwykły event: link „Zaproś gościa" rozesłany przez admina osobom już zapisanym.
      const title = String(d.eventTitle ?? 'wydarzenie');
      const name = String(d.firstName ?? '').trim();
      const max = Number(d.maxGuests ?? 0);
      const subject = `Zaproś gościa — ${title}`;
      const { text, html } = buttonMail(
        [
          name ? `${name},` : 'Dzień dobry,',
          '',
          `dziękujemy za zapis na: ${title}.`,
          d.when ? `Termin: ${String(d.when)}.` : '',
          '',
          `Możesz zaprosić ${max === 1 ? 'jedną osobę' : `do ${max} osób`} — każda dostanie od nas osobisty link do rejestracji:`,
        ],
        { label: 'Zaproś gościa', href: String(d.guestInviteLink ?? '') },
        ['', ...SIGNATURE],
      );
      return { subject, text, html };
    }

    if (payload.type === 'COURSE_NEW_MATERIALS') {
      // Publikacja stopniowa: w panelu formacyjnym pojawiły się zaplanowane materiały.
      const en = mailEn(payload.locale);
      const course = String(d.courseTitle ?? (en ? 'online course' : 'kurs online'));
      const name = String(d.firstName ?? '').trim();
      const hello = name ? `${name},` : en ? 'Hello,' : 'Dzień dobry,';
      const sig = en ? ['God bless,', 'ICPE Mission Poland'] : SIGNATURE;
      const items = Array.isArray(d.items) ? (d.items as Array<{ kind?: string; title?: string }>) : [];
      const lines = items.map((i) =>
        `• ${en ? (i.kind === 'VIDEO' ? 'Video' : 'Material') : i.kind === 'VIDEO' ? 'Film' : 'Materiał'}: ${String(i.title ?? '')}`,
      );
      const subject = en ? `New materials are waiting for you — ${course}` : `Nowe materiały czekają na Ciebie — ${course}`;
      const { text, html } = buttonMail(
        en
          ? [hello, '', `new materials are waiting for you in the formation panel of "${course}":`, '', ...lines]
          : [hello, '', `nowe materiały czekają na Ciebie w panelu formacyjnym kursu „${course}":`, '', ...lines],
        { label: en ? 'Go to the formation panel' : 'Przejdź do panelu formacyjnego', href: String(d.link ?? '') },
        [
          ...(d.hasPassword === false
            ? [en ? 'No password yet? Use "Forgot password / first login" on the course page.' : 'Nie masz jeszcze hasła? Użyj „Nie pamiętam hasła / pierwsze logowanie" na stronie kursu.', '']
            : []),
          ...sig,
        ],
      );
      return { subject, text, html };
    }

    if (payload.type === 'COURSE_WELCOME' || payload.type === 'COURSE_ACCESS' || payload.type === 'MEMBER_PASSWORD_RESET') {
      // Formacja online (panel kursanta) — PL/EN wg języka konta.
      const en = mailEn(payload.locale);
      const course = String(d.courseTitle ?? (en ? 'online course' : 'kurs online'));
      const name = String(d.firstName ?? '').trim();
      const hello = name ? `${name},` : en ? 'Hello,' : 'Dzień dobry,';
      const sig = en ? ['God bless,', 'ICPE Mission Poland'] : SIGNATURE;
      const href = String(d.link ?? '');
      if (payload.type === 'COURSE_WELCOME') {
        const subject = en ? `Your access to: ${course}` : `Dostęp do kursu: ${course}`;
        const { text, html } = buttonMail(
          en
            ? [hello, '', `you now have access to the online course "${course}".`, `Your login is your e-mail address: ${String(d.email ?? '')}.`, '', 'To start, set your password:']
            : [hello, '', `masz już dostęp do kursu online „${course}".`, `Loginem jest Twój adres e-mail: ${String(d.email ?? '')}.`, '', 'Na początek ustaw swoje hasło:'],
          { label: en ? 'Set password' : 'Ustaw hasło', href },
          [
            en ? 'The link is personal and valid for 14 days. After that, use "Forgot password" on the course page.' : 'Link jest osobisty i ważny 14 dni. Później użyj „Nie pamiętam hasła" na stronie kursu.',
            en ? `Course page: ${String(d.courseLink ?? '')}` : `Strona kursu: ${String(d.courseLink ?? '')}`,
            '',
            ...sig,
          ],
        );
        return { subject, text, html };
      }
      if (payload.type === 'COURSE_ACCESS') {
        const subject = en ? `New course available: ${course}` : `Nowy kurs w Twoim koncie: ${course}`;
        const { text, html } = buttonMail(
          en
            ? [hello, '', `you now have access to the online course "${course}".`, 'Log in with your e-mail address and the password you already use:']
            : [hello, '', `masz już dostęp do kursu online „${course}".`, 'Zaloguj się swoim adresem e-mail i hasłem, którego już używasz:'],
          { label: en ? 'Go to the course' : 'Przejdź do kursu', href },
          ['', ...sig],
        );
        return { subject, text, html };
      }
      const hours = Math.max(1, Number(d.validHours ?? 1));
      const hPl = hours === 1 ? '1 godzinę' : hours % 10 >= 2 && hours % 10 <= 4 && (hours < 10 || hours > 20) ? `${hours} godziny` : `${hours} godzin`;
      const hEn = hours === 1 ? '1 hour' : `${hours} hours`;
      const subject = en ? `Password reset — ${course}` : `Reset hasła — ${course}`;
      const { text, html } = buttonMail(
        en
          ? [hello, '', `here is a link to set a new password for "${course}".`, `Set a new password here (the link is valid for ${hEn}):`]
          : [hello, '', `przesyłamy link do ustawienia nowego hasła do kursu „${course}".`, `Nowe hasło ustawisz tutaj (link ważny ${hPl}):`],
        { label: en ? 'Set a new password' : 'Ustaw nowe hasło', href },
        [en ? 'If you did not ask for this, just ignore this message.' : 'Jeśli to nie Ty, po prostu zignoruj tę wiadomość.', '', ...sig],
      );
      return { subject, text, html };
    }

    if (payload.type === 'TEST') {
      const subject = 'Test wysyłki — panel rejestracji ICPE';
      const { text, html } = buttonMail(
        [
          'To jest wiadomość testowa z panelu rejestracji ICPE Mission.',
          `Dostawca: ${String(d.provider ?? '')}.`,
          'Skoro ją widzisz, wysyłka maili działa.',
          '',
          ...SIGNATURE,
        ],
        null,
        [],
      );
      return { subject, text, html };
    }

    if (payload.type === 'ACCOMMODATION_CHANGED') {
      // Gość zmienił / domówił nocleg na stronie zgłoszenia — nowa kwota (i gotówka do przygotowania).
      const lang = mailLangOf(payload.locale);
      const title = String(d.eventTitle ?? L(lang, { pl: 'wydarzenie', en: 'the event', ko: '행사', zh: '活动' }));
      const total = Number(d.totalPrice ?? 0);
      const amount = formatMoney(total, (String(d.currency ?? 'PLN') as 'PLN' | 'EUR' | 'USD'), lang);
      const regNo = String(payload.registrationId ?? '');
      const subject = L(lang, {
        pl: `Zmiana noclegu — ${title}`,
        en: `Accommodation updated — ${title}`,
        ko: `숙박 변경 — ${title}`,
        zh: `住宿变更 — ${title}`,
      });
      const { text, html } = buttonMail(
        [
          greetingLine(lang),
          '',
          L(lang, {
            pl: `Zapisaliśmy zmianę noclegu w zgłoszeniu na: ${title}.`,
            en: `We have saved your accommodation change for: ${title}.`,
            ko: `${title} 신청의 숙박 변경 사항을 저장했습니다.`,
            zh: `我们已保存您在“${title}”报名中的住宿变更。`,
          }),
          ...accommodationLines(d.accommodation as MailAccommodation | undefined, lang),
          ...(total > 0
            ? paymentLines(d.paymentMethod, amount, lang, total, String(d.currency ?? 'PLN'), d.leaderDepositPct as number | undefined)
            : [L(lang, { pl: 'Kwota: bezpłatnie.', en: 'Amount: free of charge.', ko: '금액: 무료.', zh: '金额：免费。' })]),
          '',
          L(lang, { pl: `Numer zgłoszenia: ${regNo}`, en: `Registration number: ${regNo}`, ko: `신청 번호: ${regNo}`, zh: `报名编号：${regNo}` }),
        ],
        d.manageLink
          ? { label: L(lang, { pl: 'Zobacz zgłoszenie', en: 'View registration', ko: '신청 보기', zh: '查看报名' }), href: String(d.manageLink) }
          : null,
        signature(lang),
        lang,
      );
      return { subject, text, html };
    }

    if (payload.type === 'ACCOMMODATION_CHANGED_ADMIN') {
      // Kopia dla organizatora (adres MAIL_REPLY_TO): kto zmienił nocleg i jak.
      const title = String(d.eventTitle ?? 'wydarzenie');
      const who = String(d.guestName ?? '');
      const subject = `Zmiana noclegu: ${who} — ${title}`;
      const before = (d.before as MailAccommodation | undefined);
      const after = (d.accommodation as MailAccommodation | undefined);
      const { text, html } = buttonMail(
        [
          `${who} (${String(d.guestEmail ?? '')}) zmienił(a) nocleg w zgłoszeniu ${String(payload.registrationId ?? '')} na: ${title}.`,
          '',
          'Było:',
          ...accommodationLines(before, 'pl'),
          '',
          'Jest:',
          ...accommodationLines(after, 'pl'),
          `Kwota: ${formatMoney(Number(d.oldTotal ?? 0), (String(d.currency ?? 'PLN') as 'PLN'), 'pl')} → ${formatMoney(Number(d.totalPrice ?? 0), (String(d.currency ?? 'PLN') as 'PLN'), 'pl')} (${payLabel(d.paymentMethod)}).`,
        ],
        null,
        [],
      );
      return { subject, text, html };
    }

    if (payload.type === 'REGISTRATION_REMINDER') {
      // Jedno przypomnienie 3 h po porzuceniu formularza (LeadsService).
      const lang = mailLangOf(payload.locale);
      const title = String(d.eventTitle ?? L(lang, { pl: 'wydarzenie', en: 'the event', ko: '행사', zh: '活动' }));
      const name = String(d.firstName ?? '').trim();
      const when = String(d.when ?? '').trim();
      const subject = L(lang, {
        pl: `Nie zapomnij dokończyć zgłoszenia — ${title}`,
        en: `Don't forget to finish your registration — ${title}`,
        ko: `신청을 마무리하는 것을 잊지 마세요 — ${title}`,
        zh: `别忘了完成报名 — ${title}`,
      });
      const { text, html } = buttonMail(
        [
          greetingLine(lang, name),
          '',
          ...L(lang, {
            pl: [`rozpoczęłaś/rozpocząłeś zapis na wydarzenie: ${title}${when ? ` (${when})` : ''}, ale zgłoszenie nie zostało wysłane.`, 'Miejsce nie jest zarezerwowane, dopóki nie wyślesz formularza. Dokończysz go tutaj:'],
            en: [`you started registering for ${title}${when ? ` (${when})` : ''}, but the registration was not completed.`, 'Your place is not booked until you send the form. You can finish it here:'],
            ko: [`${title}${when ? ` (${when})` : ''} 신청을 시작하셨지만 아직 신청이 완료되지 않았습니다.`, '신청서를 보내셔야 자리가 확보됩니다. 여기에서 마무리하실 수 있습니다:'],
            zh: [`您已开始报名参加“${title}”${when ? `（${when}）` : ''}，但报名尚未完成。`, '提交报名表后才会为您保留名额。您可以在这里完成报名：'],
          }),
        ],
        { label: L(lang, { pl: 'Dokończ zgłoszenie', en: 'Finish registration', ko: '신청 마치기', zh: '完成报名' }), href: String(d.link ?? '') },
        [
          L(lang, {
            pl: 'Jeśli nie planujesz przyjechać, zignoruj tę wiadomość — nie będziemy już o tym pisać.',
            en: "If you're not planning to come, just ignore this message — we won't write about it again.",
            ko: '참석하실 계획이 없다면 이 메일은 무시하셔도 됩니다. 이 일로 다시 연락드리지 않겠습니다.',
            zh: '如果您不打算参加，请忽略此邮件——我们不会再就此事联系您。',
          }),
          '',
          ...signature(lang),
        ],
        lang,
      );
      return { subject, text, html };
    }

    if (payload.type === 'WAITLIST_OPEN') {
      // Lista oczekujących: zapisy właśnie ruszyły.
      const lang = mailLangOf(payload.locale);
      const title = String(d.eventTitle ?? L(lang, { pl: 'wydarzenie', en: 'the event', ko: '행사', zh: '活动' }));
      const subject = L(lang, {
        pl: `Zapisy otwarte — ${title}`,
        en: `Registration is open — ${title}`,
        ko: `신청이 시작되었습니다 — ${title}`,
        zh: `报名已开放 — ${title}`,
      });
      const { text, html } = buttonMail(
        [
          greetingLine(lang),
          '',
          L(lang, {
            pl: `Zapisy na wydarzenie „${title}” właśnie ruszyły. Jesteś na liście oczekujących, dlatego piszemy do Ciebie w pierwszej kolejności.`,
            en: `Registration for "${title}" has just opened. You are on the waiting list, so we are letting you know first.`,
            ko: `「${title}」 신청이 방금 시작되었습니다. 대기자 명단에 등록하셨기에 가장 먼저 알려 드립니다.`,
            zh: `「${title}」的报名刚刚开放。您在候补名单上，所以我们第一时间通知您。`,
          }),
          L(lang, {
            pl: 'Liczba miejsc jest ograniczona.',
            en: 'The number of places is limited.',
            ko: '자리가 한정되어 있습니다.',
            zh: '名额有限。',
          }),
          '',
        ],
        { label: L(lang, { pl: 'Zapisz się', en: 'Register', ko: '신청하기', zh: '立即报名' }), href: String(d.link ?? '') },
        [
          L(lang, {
            pl: 'To jednorazowa wiadomość — nie będziemy pisać w tej sprawie ponownie.',
            en: "This is a one-off message — we won't write about this again.",
            ko: '이 메일은 한 번만 발송됩니다.',
            zh: '此邮件仅发送一次。',
          }),
          '',
          ...signature(lang),
        ],
        lang,
      );
      return { subject, text, html };
    }

    if (payload.type === 'PAYMENT_DUE_SOON' || payload.type === 'PAYMENT_OVERDUE') {
      // Przypomnienie o racie: 3 dni przed terminem / ponaglenie 7 dni po terminie (liczby dni z planu eventu).
      const lang = mailLangOf(payload.locale);
      const overdue = payload.type === 'PAYMENT_OVERDUE';
      const cur = String(d.currency ?? 'PLN') as 'PLN' | 'EUR' | 'USD';
      const f = (n: unknown) => formatMoney(Number(n ?? 0), cur, lang);
      const title = String(d.eventTitle ?? L(lang, { pl: 'wydarzenie', en: 'the event', ko: '행사', zh: '活动' }));
      const due = mailDate(String(d.dueDate ?? ''), lang);
      const regNo = String(payload.registrationId ?? '');
      const subject = overdue
        ? L(lang, { pl: `Zaległa wpłata — ${title}`, en: `Overdue payment — ${title}`, ko: `미납 안내 — ${title}`, zh: `逾期付款提醒 — ${title}` })
        : L(lang, { pl: `Przypomnienie o wpłacie — ${title}`, en: `Payment reminder — ${title}`, ko: `납부 안내 — ${title}`, zh: `付款提醒 — ${title}` });
      const lead = overdue
        ? L(lang, {
            pl: `Termin wpłaty za udział w wydarzeniu „${title}” minął ${due}, a nie odnotowaliśmy jeszcze pełnej kwoty.`,
            en: `The payment for "${title}" was due on ${due} and we have not yet recorded the full amount.`,
            ko: `「${title}」 참가비 납부 기한(${due})이 지났으나 아직 전액이 확인되지 않았습니다.`,
            zh: `「${title}」的付款期限（${due}）已过，我们尚未收到全部应付款项。`,
          })
        : L(lang, {
            pl: `Przypominamy, że ${due} mija termin kolejnej wpłaty za udział w wydarzeniu „${title}”.`,
            en: `A reminder that the next payment for "${title}" is due on ${due}.`,
            ko: `「${title}」 참가비의 다음 납부 기한은 ${due}입니다.`,
            zh: `提醒您：「${title}」的下一笔付款将于 ${due} 到期。`,
          });
      const intro = [
        greetingLine(lang),
        '',
        lead,
        L(lang, { pl: `Do wpłaty: ${f(d.amount)}.`, en: `Amount due: ${f(d.amount)}.`, ko: `납부하실 금액: ${f(d.amount)}.`, zh: `应付金额：${f(d.amount)}。` }),
        L(lang, {
          pl: `Dotychczas wpłacono ${f(d.paid)} z ${f(d.total)}.`,
          en: `Paid so far: ${f(d.paid)} of ${f(d.total)}.`,
          ko: `현재까지 납부액: ${f(d.total)} 중 ${f(d.paid)}.`,
          zh: `已付：${f(d.paid)}，总额 ${f(d.total)}。`,
        }),
        ...(d.account
          ? ['', L(lang, {
              pl: `Przelew: ${d.recipient ? `${String(d.recipient)}, ` : ''}rachunek ${String(d.account)}. W tytule podaj numer zgłoszenia: ${regNo}.`,
              en: `Bank transfer: ${d.recipient ? `${String(d.recipient)}, ` : ''}account ${String(d.account)}. Please put your registration number in the transfer title: ${regNo}.`,
              ko: `계좌 이체: ${d.recipient ? `${String(d.recipient)}, ` : ''}계좌 ${String(d.account)}. 이체 메모에 신청 번호를 적어 주세요: ${regNo}.`,
              zh: `银行转账：${d.recipient ? `${String(d.recipient)}，` : ''}账号 ${String(d.account)}。请在转账备注中填写报名编号：${regNo}。`,
            })]
          : ['', L(lang, { pl: `Numer zgłoszenia: ${regNo}`, en: `Registration number: ${regNo}`, ko: `신청 번호: ${regNo}`, zh: `报名编号：${regNo}` })]),
        // Przelewy z zagranicy: SWIFT, bank, adres banku — poza wersją polską i tylko wypełnione.
        ...(lang !== 'pl' && d.account
          ? [
              d.swift ? `SWIFT / BIC: ${String(d.swift)}` : '',
              d.bankName ? L(lang, { pl: '', en: `Bank: ${String(d.bankName)}`, ko: `은행: ${String(d.bankName)}`, zh: `银行：${String(d.bankName)}` }) : '',
              d.bankAddress ? L(lang, { pl: '', en: `Bank address: ${String(d.bankAddress)}`, ko: `은행 주소: ${String(d.bankAddress)}`, zh: `银行地址：${String(d.bankAddress)}` }) : '',
            ].filter(Boolean)
          : []),
        ...(d.operator
          ? [L(lang, {
              pl: `Podmiot obsługujący wydarzenie za zgodą Executive Council: ${String(d.operator)}`,
              en: `Event operator, with the consent of the Executive Council: ${String(d.operator)}`,
              ko: `Executive Council의 동의를 받아 행사를 운영하는 주체: ${String(d.operator)}`,
              zh: `经 Executive Council 同意承办本次活动的机构：${String(d.operator)}`,
            })]
          : []),
        '',
      ];
      const outro = [
        L(lang, {
          pl: 'Jeśli wpłata została już wysłana, prosimy zignorować tę wiadomość — księgowanie może potrwać kilka dni.',
          en: 'If you have already sent the payment, please ignore this message — it can take a few days to be recorded.',
          ko: '이미 납부하셨다면 이 메일은 무시하셔도 됩니다. 입금 확인에는 며칠이 걸릴 수 있습니다.',
          zh: '如果您已付款，请忽略此邮件——入账可能需要几天时间。',
        }),
        '',
        ...signature(lang),
      ];
      const link = String(d.manageLink ?? '');
      // Płatność online (Tpay) — tylko gdy reguła kraj / język ją daje (ustala wołający: `payOnline`).
      const payOnline = !!d.payOnline && !!link;
      const { text, html } = buttonMail(
        payOnline
          ? [...intro.slice(0, -1), '', L(lang, {
              pl: 'Możesz też zapłacić online (BLIK · szybki przelew) — wpłata zaksięguje się automatycznie:',
              en: 'You can also pay online — the payment will be recorded automatically:',
              ko: '온라인으로도 결제하실 수 있으며, 결제는 자동으로 확인됩니다:',
              zh: '您也可以在线付款——付款将自动入账：',
            }), '']
          : intro,
        link
          ? payOnline
            ? { label: L(lang, { pl: 'Zapłać online', en: 'Pay online', ko: '온라인 결제', zh: '在线付款' }), href: `${link}#platnosci` }
            : { label: L(lang, { pl: 'Zobacz zgłoszenie', en: 'View registration', ko: '신청 내역 보기', zh: '查看报名' }), href: link }
          : null,
        outro,
        lang,
      );
      return { subject, text, html };
    }

    if (payload.type === 'PAYMENT_RECEIVED') {
      // „Otrzymaliśmy wpłatę” — po zaksięgowaniu płatności online (podpisane powiadomienie operatora).
      const lang = mailLangOf(payload.locale);
      const cur = String(d.currency ?? 'PLN') as 'PLN' | 'EUR' | 'USD';
      const f = (n: unknown) => formatMoney(Number(n ?? 0), cur, lang);
      const title = String(d.eventTitle ?? L(lang, { pl: 'wydarzenie', en: 'the event', ko: '행사', zh: '活动' }));
      const regNo = String(payload.registrationId ?? '');
      const remaining = Number(d.remaining ?? 0);
      const next = d.nextDue as { amount?: number; dueDate?: string } | null | undefined;
      const subject = L(lang, {
        pl: `Otrzymaliśmy wpłatę — ${title}`,
        en: `Payment received — ${title}`,
        ko: `납부 확인 — ${title}`,
        zh: `已收到付款 — ${title}`,
      });
      const intro = [
        greetingLine(lang),
        '',
        L(lang, {
          pl: `Otrzymaliśmy Twoją wpłatę ${f(d.amount)} za udział w wydarzeniu „${title}”. Dziękujemy!`,
          en: `We have received your payment of ${f(d.amount)} for "${title}". Thank you!`,
          ko: `「${title}」 참가비 ${f(d.amount)} 납부가 확인되었습니다. 감사합니다!`,
          zh: `我们已收到您为「${title}」支付的 ${f(d.amount)}。谢谢！`,
        }),
        L(lang, {
          pl: `Dotychczas wpłacono ${f(d.paid)} z ${f(d.total)}.`,
          en: `Paid so far: ${f(d.paid)} of ${f(d.total)}.`,
          ko: `현재까지 납부액: ${f(d.total)} 중 ${f(d.paid)}.`,
          zh: `已付：${f(d.paid)}，总额 ${f(d.total)}。`,
        }),
        remaining > 0.005
          ? next?.dueDate && Number(next.amount) > 0
            ? L(lang, {
                pl: `Pozostało do zapłaty: ${f(remaining)}. Najbliższa wpłata: ${f(next.amount)} do ${mailDate(String(next.dueDate), lang)}.`,
                en: `Remaining: ${f(remaining)}. Next payment: ${f(next.amount)} by ${mailDate(String(next.dueDate), lang)}.`,
                ko: `남은 금액: ${f(remaining)}. 다음 납부: ${mailDate(String(next.dueDate), lang)}까지 ${f(next.amount)}.`,
                zh: `待付金额：${f(remaining)}。下一笔付款：${mailDate(String(next.dueDate), lang)}前支付 ${f(next.amount)}。`,
              })
            : L(lang, { pl: `Pozostało do zapłaty: ${f(remaining)}.`, en: `Remaining: ${f(remaining)}.`, ko: `남은 금액: ${f(remaining)}.`, zh: `待付金额：${f(remaining)}。` })
          : L(lang, {
              pl: 'Zgłoszenie jest opłacone w całości.',
              en: 'Your registration is now paid in full.',
              ko: '참가비가 전액 납부되었습니다.',
              zh: '您的报名费用已全部付清。',
            }),
        '',
        L(lang, { pl: `Numer zgłoszenia: ${regNo}`, en: `Registration number: ${regNo}`, ko: `신청 번호: ${regNo}`, zh: `报名编号：${regNo}` }),
        ...(d.transactionTitle
          ? [L(lang, {
              pl: `Numer transakcji: ${String(d.transactionTitle)}`,
              en: `Transaction number: ${String(d.transactionTitle)}`,
              ko: `거래 번호: ${String(d.transactionTitle)}`,
              zh: `交易编号：${String(d.transactionTitle)}`,
            })]
          : []),
        '',
      ];
      const link = String(d.manageLink ?? '');
      const { text, html } = buttonMail(
        intro,
        link ? { label: L(lang, { pl: 'Zobacz zgłoszenie', en: 'View registration', ko: '신청 내역 보기', zh: '查看报名' }), href: link } : null,
        signature(lang),
        lang,
      );
      return { subject, text, html };
    }

    if (payload.type === 'PAYMENT_REFUNDED') {
      // „Zwróciliśmy wpłatę” — po zwrocie wpłaty online zleconym w panelu i przyjętym przez operatora.
      const lang = mailLangOf(payload.locale);
      const cur = String(d.currency ?? 'PLN') as 'PLN' | 'EUR' | 'USD';
      const f = (n: unknown) => formatMoney(Number(n ?? 0), cur, lang);
      const title = String(d.eventTitle ?? L(lang, { pl: 'wydarzenie', en: 'the event', ko: '행사', zh: '活动' }));
      const regNo = String(payload.registrationId ?? '');
      const remaining = Number(d.remaining ?? 0);
      const subject = L(lang, {
        pl: `Zwróciliśmy wpłatę — ${title}`,
        en: `Payment refunded — ${title}`,
        ko: `환불 안내 — ${title}`,
        zh: `已退款 — ${title}`,
      });
      const intro = [
        greetingLine(lang),
        '',
        L(lang, {
          pl: `Zwróciliśmy ${f(d.amount)} z Twojej wpłaty za udział w wydarzeniu „${title}”. Pieniądze wrócą tą samą drogą, którą zapłacono; zwykle trwa to kilka dni roboczych.`,
          en: `We have refunded ${f(d.amount)} of your payment for "${title}". The money will be returned the same way it was paid; this usually takes a few business days.`,
          ko: `「${title}」 참가비 중 ${f(d.amount)}을(를) 환불해 드렸습니다. 환불금은 결제하신 수단으로 반환되며, 보통 영업일 기준 며칠이 걸립니다.`,
          zh: `我们已退还您为「${title}」支付的款项中的 ${f(d.amount)}。款项将按原支付方式退回，通常需要几个工作日。`,
        }),
        L(lang, {
          pl: `Po zwrocie wpłacono ${f(d.paid)} z ${f(d.total)}.`,
          en: `Paid after the refund: ${f(d.paid)} of ${f(d.total)}.`,
          ko: `환불 후 납부액: ${f(d.total)} 중 ${f(d.paid)}.`,
          zh: `退款后已付：${f(d.paid)}，总额 ${f(d.total)}。`,
        }),
        ...(remaining > 0.005
          ? [L(lang, { pl: `Pozostało do zapłaty: ${f(remaining)}.`, en: `Remaining: ${f(remaining)}.`, ko: `남은 금액: ${f(remaining)}.`, zh: `待付金额：${f(remaining)}。` })]
          : []),
        '',
        L(lang, { pl: `Numer zgłoszenia: ${regNo}`, en: `Registration number: ${regNo}`, ko: `신청 번호: ${regNo}`, zh: `报名编号：${regNo}` }),
        ...(d.transactionTitle
          ? [L(lang, {
              pl: `Numer transakcji: ${String(d.transactionTitle)}`,
              en: `Transaction number: ${String(d.transactionTitle)}`,
              ko: `거래 번호: ${String(d.transactionTitle)}`,
              zh: `交易编号：${String(d.transactionTitle)}`,
            })]
          : []),
        '',
      ];
      const link = String(d.manageLink ?? '');
      const { text, html } = buttonMail(
        intro,
        link ? { label: L(lang, { pl: 'Zobacz zgłoszenie', en: 'View registration', ko: '신청 내역 보기', zh: '查看报名' }), href: link } : null,
        signature(lang),
        lang,
      );
      return { subject, text, html };
    }

    if (payload.type === 'ONLINE_PAYMENT_ALERT') {
      // Do organizatora: zdarzenie płatności online wymagające uwagi (rozbieżność kwoty, zwrot, nieznana transakcja…).
      const reasons: Record<string, string> = {
        AMOUNT_MISMATCH: 'Wpłacona kwota różni się od kwoty, na którą utworzono płatność. Zaksięgowaliśmy faktyczny wpływ.',
        CANCELLED_REGISTRATION: 'Wpłata przyszła do zgłoszenia, które jest anulowane. Wpłata została zaksięgowana — zdecyduj o zwrocie albo przywróceniu zgłoszenia.',
        UNKNOWN_CRC: 'Przyszło poprawnie podpisane powiadomienie o transakcji, której nie ma w systemie. NIE została zaksięgowana.',
        CURRENCY: 'Powiadomienie w walucie innej niż PLN. Wpłata NIE została zaksięgowana automatycznie.',
        BAD_AMOUNT: 'Powiadomienie bez poprawnej kwoty wpłaty. Wpłata NIE została zaksięgowana automatycznie.',
        REFUND: 'Tpay zgłosił pełny zwrot transakcji. Wpłata została oznaczona jako zwrócona; status zgłoszenia NIE został zmieniony.',
        REFUND_UNMATCHED: 'Tpay zgłosił zwrot transakcji, dla której nie mamy zaksięgowanej wpłaty. Sprawdź w panelu Tpay.',
        REFUND_UNCERTAIN: 'Zwrot zlecony w panelu NIE został potwierdzony przez Tpay (przekroczony czas albo błąd połączenia). Nie wiadomo, czy się wykonał. System NIE ponowił zlecenia i NIE pomniejszył wpłat. Sprawdź transakcję w panelu Tpay, a potem w panelu ▸ Płatności oznacz zwrot jako wykonany albo niewykonany — do tego czasu kolejne zwroty tej wpłaty są zablokowane.',
        REFUND_BOOKING_FAILED: 'Tpay PRZYJĄŁ zwrot zlecony w panelu, ale nie udało się go zapisać w systemie. NIE zlecaj go ponownie. W panelu ▸ Płatności oznacz zwrot jako wykonany.',
        OVERPAID: 'Po tej wpłacie suma wpłat przekracza kwotę zgłoszenia (np. dwie opłacone próby). Rozważ zwrot nadpłaty z panelu Tpay.',
      };
      const reason = String(d.reason ?? '');
      const regNo = String(payload.registrationId ?? '');
      const subject = `Płatność online wymaga uwagi${d.transactionTitle ? ` — ${String(d.transactionTitle)}` : ''}`;
      const amountLine = (label: string, v: unknown) => (v === undefined || v === null || v === '' ? '' : `${label}: ${money(v, d.currency)}`);
      const intro = [
        'Dzień dobry,',
        '',
        reasons[reason] ?? `Zdarzenie płatności online: ${reason}.`,
        '',
        d.eventTitle ? `Wydarzenie: ${String(d.eventTitle)}` : '',
        regNo ? `Zgłoszenie: ${regNo}${d.guestName ? ` (${String(d.guestName)})` : ''}` : '',
        d.transactionTitle ? `Transakcja Tpay: ${String(d.transactionTitle)}` : '',
        amountLine('Kwota wpłacona', d.paidAmount),
        amountLine('Kwota oczekiwana', d.expectedAmount),
        amountLine('Kwota zwrotu', d.refundAmount),
        d.testMode ? 'Uwaga: transakcja w trybie testowym (sandbox).' : '',
        '',
        'Szczegóły: panel ▸ Płatności oraz panel Tpay.',
      ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== ''));
      const { text, html } = buttonMail(intro, null, []);
      return { subject, text, html };
    }

    if (payload.type === 'PAYMENT_REMINDER') {
      const subject = `Przypomnienie o płatności — ${String(d.transferTitle ?? '')}`;
      const text = `Dzień dobry,\n\nPrzypominamy o płatności na kwotę ${money(d.amount, 'PLN')} (tytuł: ${String(
        d.transferTitle ?? '',
      )}).\n\nSzczęść Boże,\nICPE Mission Polska`;
      return { subject, text, html: `<p>${text.replace(/\n/g, '<br/>')}</p>` };
    }

    const subject = `Powiadomienie — ICPE Mission`;
    return { subject, text: JSON.stringify(d), html: `<pre>${JSON.stringify(d, null, 2)}</pre>` };
  }

  /**
   * Wysyła (albo tylko loguje) maila. Zwraca końcowy status, żeby wołający mógł pokazać
   * adminowi, czy mail faktycznie wyszedł — błąd dostawcy jest łapany tutaj.
   * `LOGGED` = brak skonfigurowanego dostawcy, czyli mail NIE poszedł do nikogo.
   */
  async sendMail(payload: MailPayload): Promise<'SENT' | 'FAILED' | 'LOGGED'> {
    return (await this.sendMailDetailed(payload)).status;
  }

  /** Jak `sendMail`, ale z treścią błędu — używane przez „Wyślij test" w Ustawieniach. */
  async sendMailDetailed(payload: MailPayload): Promise<MailResult> {
    const notification = await this.prisma.notification.create({
      data: {
        type: payload.type,
        channel: 'email',
        to: payload.to,
        locale: payload.locale,
        status: 'QUEUED',
        provider: this.mailMode,
        payload: payload.data as object,
        registrationId: payload.registrationId,
      } as never,
    });
    const mark = (data: Record<string, unknown>) =>
      this.prisma.notification
        .update({ where: { id: notification.id }, data: data as never })
        .catch((e: Error) => this.logger.error(`Notification update failed: ${e.message}`));

    if (this.mailMode === 'log') {
      // Brak dostawcy: maile tylko w logach Render — NIC nie wychodzi na zewnątrz.
      this.logger.log(`[log] ${payload.type} → ${payload.to}`);
      await mark({ status: 'LOGGED' });
      return { status: 'LOGGED' };
    }

    try {
      const { subject, text, html } = this.buildEmail(payload);
      let providerId: string | null = null;
      if (this.mailMode === 'resend') {
        providerId = await this.sendViaResend({ to: payload.to, subject, text, html });
      } else {
        const transporter = await this.getTransporter();
        const info = await transporter.sendMail({
          from: this.fromAddress(),
          to: payload.to,
          replyTo: this.replyTo(),
          subject,
          text,
          html,
        });
        providerId = (info?.messageId as string) ?? null;
      }
      await mark({ status: 'SENT', providerId });
      return { status: 'SENT' };
    } catch (e) {
      const error = (e as Error).name === 'AbortError' ? 'Przekroczony czas odpowiedzi dostawcy' : (e as Error).message;
      this.logger.error(`${this.mailMode} send failed (${payload.type} → ${payload.to}): ${error}`);
      await mark({ status: 'FAILED', error: error.slice(0, 500) });
      return { status: 'FAILED', error };
    }
  }

  /** Stan konfiguracji poczty — sekcja „E-mail" w Ustawieniach panelu (bez sekretów). */
  status() {
    const key = (this.config.get<string>('RESEND_API_KEY') ?? '').trim();
    return {
      provider: this.mailMode,
      from: this.fromAddress(),
      replyTo: this.replyTo() ?? null,
      resendKeySet: !!key,
      // Ostatnie 4 znaki pomagają sprawdzić, który klucz jest wpięty, bez ujawniania go.
      resendKeyHint: key ? `…${key.slice(-4)}` : null,
      smtpHost: this.mailMode === 'smtp' ? this.config.get<string>('SMTP_HOST') ?? null : null,
      mailModeEnv: (this.config.get<string>('MAIL_MODE') ?? '').trim() || null,
    };
  }

  /** Dziennik ostatnich maili (najnowsze pierwsze). */
  async log(limit = 30) {
    const rows = await this.prisma.notification.findMany({
      where: { channel: 'email' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      type: r.type as string,
      to: r.to as string,
      status: r.status as string,
      provider: (r.provider as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      createdAt: (r.createdAt as Date).toISOString(),
    }));
  }

  /** Mail testowy z panelu. */
  async sendTest(to: string): Promise<MailResult & { provider: MailProvider }> {
    const res = await this.sendMailDetailed({
      to,
      type: 'TEST',
      locale: 'pl',
      data: { provider: this.mailMode, sentAt: new Date().toISOString() },
    });
    return { ...res, provider: this.mailMode };
  }

  async sendConfirmation(opts: {
    to: string; locale: string; registrationId: string;
    eventTitle: string; startsAt: Date; totalPrice: number; currency: string;
    paymentMethod: string; editToken: string;
    /** Link do strony „Zaproś gościa" — tylko gdy event ma włączoną tę ścieżkę. */
    guestInviteLink?: string;
    /** Podsumowanie noclegu (gdy event oferuje noclegi). */
    accommodation?: MailAccommodation;
    /** Link do strony zgłoszenia (zmiana / domówienie noclegu). */
    manageLink?: string;
    /** % zaliczki u lidera (metoda LEADER_DEPOSIT); domyślnie 50. */
    leaderDepositPct?: number;
    /** Dobrowolna darowizna gościa (już wliczona w totalPrice) — mail za nią dziękuje. */
    donation?: number;
    /** Zamówione „dodatki z limitem” (nazwa w języku maila + liczba sztuk). */
    addons?: Array<{ name: string; qty: number }>;
    /** Harmonogram wpłat zgłoszenia (gdy event ma plan rat). */
    schedule?: Array<{ label?: string; dueDate: string; amount: number; atRegistration?: boolean }>;
    /** Link do strony zgłoszenia `/z/:token` (stan i wpłaty) — w każdym potwierdzeniu. */
    statusLink?: string;
    /** Zgłoszenie może zapłacić online (reguła kraj / język daje Tpay, event ma ONLINE, PLN). */
    payOnline?: boolean;
  }) {
    await this.sendMail({
      to: opts.to,
      type: 'CONFIRMATION',
      locale: opts.locale,
      registrationId: opts.registrationId,
      data: opts,
    });
  }

  /** Gość zmienił nocleg: mail do gościa + kopia do organizatora (MAIL_REPLY_TO, gdy ustawiony). */
  async sendAccommodationChanged(opts: {
    to: string; locale: string; registrationId: string; eventTitle: string;
    totalPrice: number; oldTotal: number; currency: string; paymentMethod: string;
    accommodation: MailAccommodation; before: MailAccommodation; manageLink: string;
    guestName: string; leaderDepositPct?: number;
  }) {
    await this.sendMail({ to: opts.to, type: 'ACCOMMODATION_CHANGED', locale: opts.locale, registrationId: opts.registrationId, data: opts });
    const admin = this.replyTo();
    if (admin) {
      await this.sendMail({
        to: admin,
        type: 'ACCOMMODATION_CHANGED_ADMIN',
        locale: 'pl',
        registrationId: opts.registrationId,
        data: { ...opts, guestEmail: opts.to, eventTitle: opts.eventTitle },
      });
    }
  }

  /** Przypomnienie o racie przed terminem / ponaglenie po terminie (harmonogram wpłat eventu). */
  async sendInstallmentReminder(opts: {
    kind: 'PAYMENT_DUE_SOON' | 'PAYMENT_OVERDUE';
    to: string; locale: string; registrationId: string;
    /** identyfikator raty — po nim sprawdzamy, czy przypomnienie już poszło */
    installmentId: string; label?: string; dueDate: string;
    amount: number; paid: number; total: number; currency: string;
    eventTitle: unknown; manageLink?: string; recipient?: string; account?: string;
    swift?: string; bankName?: string; bankAddress?: string; operator?: string;
    /** przycisk „Zapłać online” (reguła kraj / język daje Tpay i tryb `tpay`) */
    payOnline?: boolean;
  }) {
    const { kind, eventTitle, ...data } = opts;
    const lang = mailLangOf(opts.locale);
    const t = eventTitle && typeof eventTitle === 'object'
      ? ((eventTitle as Record<string, string>)[lang] ?? (eventTitle as Record<string, string>).pl ?? (eventTitle as Record<string, string>).en ?? Object.values(eventTitle as Record<string, string>)[0])
      : eventTitle;
    return this.sendMail({ to: opts.to, type: kind, locale: opts.locale, registrationId: opts.registrationId, data: { ...data, eventTitle: t ? String(t) : undefined } });
  }

  /** „Otrzymaliśmy wpłatę” — po zaksięgowaniu płatności online. */
  async sendPaymentReceived(opts: {
    to: string; locale: string; registrationId: string; eventTitle?: string;
    amount: number; paid: number; total: number; remaining: number; currency: string;
    nextDue?: { amount: number; dueDate: string } | null;
    transactionTitle?: string; manageLink?: string;
  }) {
    return this.sendMail({ to: opts.to, type: 'PAYMENT_RECEIVED', locale: opts.locale, registrationId: opts.registrationId, data: opts });
  }

  /** „Zwróciliśmy wpłatę” — po zwrocie wpłaty online zleconym w panelu. */
  async sendPaymentRefunded(opts: {
    to: string; locale: string; registrationId: string; eventTitle?: string;
    amount: number; paid: number; total: number; remaining: number; currency: string;
    transactionTitle?: string; manageLink?: string;
  }) {
    return this.sendMail({ to: opts.to, type: 'PAYMENT_REFUNDED', locale: opts.locale, registrationId: opts.registrationId, data: opts });
  }

  /**
   * Powiadomienie organizatora o zdarzeniu płatności online wymagającym uwagi. Idzie na `MAIL_REPLY_TO`;
   * gdy adres nie jest ustawiony, zostaje tylko wpis w logach. W danych NIE MA e-maila płatnika.
   */
  async sendOnlinePaymentAlert(opts: {
    reason: string; registrationId?: string; eventTitle?: string; guestName?: string;
    transactionTitle?: string; paidAmount?: number; expectedAmount?: number; refundAmount?: number; currency?: string; testMode?: boolean;
  }): Promise<void> {
    const admin = this.replyTo();
    if (!admin) {
      this.logger.warn(`Płatność online wymaga uwagi (${opts.reason}), ale MAIL_REPLY_TO nie jest ustawiony — brak adresu organizatora.`);
      return;
    }
    await this.sendMail({ to: admin, type: 'ONLINE_PAYMENT_ALERT', locale: 'pl', registrationId: opts.registrationId, data: opts });
  }

  async sendPaymentReminder(opts: { to: string; locale: string; registrationId: string; amount: number; transferTitle: string }) {
    await this.sendMail({
      to: opts.to,
      type: 'PAYMENT_REMINDER',
      locale: opts.locale,
      registrationId: opts.registrationId,
      data: opts,
    });
  }
}
