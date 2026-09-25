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
