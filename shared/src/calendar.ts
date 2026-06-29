/** Generowanie linków/plików kalendarza (Google Calendar + iCal/.ics). */

export interface CalendarEventInput {
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string;
  details?: string;
}

function toICalDate(d: Date): string {
  // UTC basic format: YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Adres "Add to Google Calendar". */
export function googleCalendarUrl(e: CalendarEventInput): string {
  const dates = `${toICalDate(e.startsAt)}/${toICalDate(e.endsAt)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates,
    location: e.location ?? '',
    details: e.details ?? '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function esc(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

/** Treść pliku .ics (RFC 5545). */
export function buildIcs(e: CalendarEventInput): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ICPE//Reg//PL',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${esc(e.uid)}`,
    `DTSTAMP:${toICalDate(new Date())}`,
    `DTSTART:${toICalDate(e.startsAt)}`,
    `DTEND:${toICalDate(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.details ? `DESCRIPTION:${esc(e.details)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
