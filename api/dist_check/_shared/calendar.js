"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleCalendarUrl = googleCalendarUrl;
exports.buildIcs = buildIcs;
function toICalDate(d) {
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function googleCalendarUrl(e) {
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
function esc(s) {
    return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}
function buildIcs(e) {
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
//# sourceMappingURL=calendar.js.map