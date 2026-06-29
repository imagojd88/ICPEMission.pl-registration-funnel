import { AttendanceService } from './attendance.service';
export declare class AttendanceController {
    private readonly attendance;
    constructor(attendance: AttendanceService);
    checkIn(dto: {
        occurrenceId: string;
        guestId?: string;
        participantName?: string;
        status?: string;
    }): Promise<any>;
    createMeetingSeries(dto: {
        title: Record<string, string>;
        recurrence: string;
    }): Promise<any>;
    getAttendance(occId: string): Promise<any>;
    updateRecord(recordId: string, dto: {
        status: string;
    }): Promise<any>;
}
