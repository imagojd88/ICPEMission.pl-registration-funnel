import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** Escapowanie treści wstawianej do HTML-a maila (tytuły eventów bywają z `&`, `<`). */
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
  private readonly mailMode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transporter: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mailMode = this.config.get<string>('MAIL_MODE', 'log');
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
        '',
        'Szczęść Boże,',
        'ICPE Mission Polska',
      ];
      const text = lines.join('\n');
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${lines
        .map((l) => (l === '' ? '<br/>' : `<p style="margin:0 0 6px">${l}</p>`))
        .join('')}</div>`;
      return { subject, text, html };
    }

    if (payload.type === 'INVITATION') {
      const title = String(d.eventTitle ?? 'wydarzenie');
      const link = String(d.link ?? '');
      const name = String(d.firstName ?? '').trim();
      const when = String(d.when ?? '');
      const where = String(d.location ?? '');
      const subject = `Zaproszenie — ${title}`;
      // Treść tekstowa (z linkiem inline) i HTML (z przyciskiem) budowane osobno —
      // wcześniej HTML powstawał przez filtrowanie linii po wartości linku, co jest kruche.
      const intro = [
        name ? `${name},` : 'Dzień dobry,',
        '',
        `zapraszamy Cię na: ${title}.`,
        when ? `Termin: ${when}.` : '',
        where ? `Miejsce: ${where}.` : '',
        '',
        'To wydarzenie tylko dla zaproszonych gości. Udział potwierdzisz swoim osobistym linkiem:',
      ];
      const outro = [
        'Prosimy nie przekazywać linku dalej — jest przypisany do Ciebie.',
        '',
        'Szczęść Boże,',
        'ICPE Mission Polska',
      ];
      const text = [...intro, link, '', ...outro].join('\n');
      const p = (l: string) => (l === '' ? '<br/>' : `<p style="margin:0 0 6px">${esc(l)}</p>`);
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">
        ${intro.map(p).join('')}
        <p style="margin:18px 0"><a href="${esc(link)}" style="display:inline-block;background:#C0603C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600">Potwierdzam udział</a></p>
        <p style="margin:0 0 14px;font-size:12px;color:#6b7280">Gdyby przycisk nie działał, skopiuj link: ${esc(link)}</p>
        ${outro.map(p).join('')}
      </div>`;
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
   * adminowi, czy mail faktycznie wyszedł — błąd SMTP jest łapany tutaj.
   * `LOGGED` = MAIL_MODE≠smtp, czyli mail NIE poszedł do nikogo (tylko wpis w logach).
   */
  async sendMail(payload: MailPayload): Promise<'SENT' | 'FAILED' | 'LOGGED'> {
    const notification = await this.prisma.notification.create({
      data: {
        type: payload.type,
        channel: 'email',
        to: payload.to,
        locale: payload.locale,
        status: 'QUEUED',
        payload: payload.data as object,
        registrationId: payload.registrationId,
      },
    });

    if (this.mailMode === 'smtp') {
      try {
        const transporter = await this.getTransporter();
        const { subject, text, html } = this.buildEmail(payload);
        const from = this.config.get<string>('MAIL_FROM', 'ICPE Mission <no-reply@icpemission.pl>');
        await transporter.sendMail({ from, to: payload.to, subject, text, html });
        await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'SENT' } });
        return 'SENT';
      } catch (e) {
        this.logger.error(`SMTP send failed: ${(e as Error).message}`);
        await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
        return 'FAILED';
      }
    }

    // Domyślnie: tryb log (maile tylko w logach Render — NIC nie wychodzi na zewnątrz).
    this.logger.log(`[log] ${payload.type} → ${payload.to}`);
    await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'LOGGED' } });
    return 'LOGGED';
  }

  async sendConfirmation(opts: {
    to: string; locale: string; registrationId: string;
    eventTitle: string; startsAt: Date; totalPrice: number; currency: string;
    paymentMethod: string; editToken: string;
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
