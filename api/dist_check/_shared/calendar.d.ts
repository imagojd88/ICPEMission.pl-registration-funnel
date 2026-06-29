export interface CalendarEventInput {
    uid: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    location?: string;
    details?: string;
}
export declare function googleCalendarUrl(e: CalendarEventInput): string;
export declare function buildIcs(e: CalendarEventInput): string;
