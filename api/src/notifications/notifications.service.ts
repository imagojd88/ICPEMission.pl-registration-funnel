import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** Wspólny układ maila z przyciskiem: akapity (intro) → przycisk → link zapasowy → akapity (outro). */
function buttonMail(intro: string[], button: { label: string; href: string } | null, outro: string[]): { text: string; html: string } {
  const text = [...intro, ...(button ? [button.href, ''] : []), ...outro].join('\n');
  const p = (l: string) => (l === '' ? '<br/>' : `<p style="margin:0 0 6px">${esc(l)}</p>`);
  const btn = button
    ? `<p style="margin:18px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#C0603C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600">${esc(button.label)}</a></p>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">Gdyby przycisk nie działał, skopiuj link: ${esc(button.href)}</p>`
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
      m === 'ONLINE' ? 'płatność online' : m === 'CASH' ? 'gotówka na miejscu' : 'przelew bankowy';

    if (payload.type === 'CONFIRMATION') {
      const title = String(d.eventTitle ?? 'wydarzenie');
      const amount = money(d.totalPrice, d.currency);
      const subject = `Potwierdzenie zgłoszenia — ${title}`;
      const lines = [
        'Dzień dobry,',
        '',
        `Dziękujemy za zgłoszenie na: ${title}.`,
        `Kwota: ${amount}.`,
        `Sposób płatności: ${payLabel(d.paymentMethod)}.`,
        d.paymentMethod === 'BANK_TRANSFER'
          ? 'Prosimy o dokonanie przelewu w podanym terminie.'
          : d.paymentMethod === 'CASH'
            ? 'Kwotę zapłacisz gotówką na miejscu.'
            : 'Płatność online zostanie potwierdzona automatycznie.',
        '',
        `Numer zgłoszenia: ${String(payload.registrationId ?? '')}`,
      ];
      const guestLink = String(d.guestInviteLink ?? '');
      if (guestLink) {
        // Ścieżka „zaproś gościa" włączona dla eventu — link działa na podstawie tokenu zgłoszenia.
        const { text, html } = buttonMail(
          [...lines, '', 'Chcesz zabrać kogoś ze sobą? Możesz zaprosić gościa — dostanie od nas zaproszenie z linkiem do rejestracji:'],
          { label: 'Zaproś gościa', href: guestLink },
          ['', ...SIGNATURE],
        );
        return { subject, text, html };
      }
      const { text, html } = buttonMail([...lines, '', ...SIGNATURE], null, []);
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
      const en = payload.locale === 'en';
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
      const en = payload.locale === 'en';
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
  }) {
    await this.sendMail({
      to: opts.to,
      type: 'CONFIRMATION',
      locale: opts.locale,
      registrationId: opts.registrationId,
      data: opts,
    });
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
