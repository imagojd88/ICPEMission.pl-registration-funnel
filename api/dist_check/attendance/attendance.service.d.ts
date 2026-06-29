import { PrismaService } from '../prisma/prisma.service';
export declare class AttendanceService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    checkIn(dto: {
        occurrenceId: string;
        guestId?: string;
        participantName?: string;
        status?: string;
        channel?: string;
    }): Promise<any>;
    createMeetingSeries(dto: {
        title: Record<string, string>;
        recurrence: string;
    }): Promise<any>;
    getOccurrenceAttendance(occurrenceId: string): Promise<any>;
    updateRecord(recordId: string, status: string): Promise<any>;
}
