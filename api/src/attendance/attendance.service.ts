import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async checkIn(dto: { occurrenceId: string; guestId?: string; participantName?: string; status?: string; channel?: string }) {
    const occurrence = await this.prisma.meetingOccurrence.findUnique({ where: { id: dto.occurrenceId } });
    if (!occurrence) throw new NotFoundException('Occurrence not found');
    return this.prisma.attendanceRecord.create({
      data: {
        occurrenceId: dto.occurrenceId,
        guestId: dto.guestId,
        participantName: dto.participantName,
        status: (dto.status ?? 'PRESENT') as 'PRESENT' | 'ABSENT' | 'EXCUSED',
        channel: dto.channel ?? 'self',
      },
    });
  }

  async createMeetingSeries(dto: { title: Record<string, string>; recurrence: string }) {
    return this.prisma.meetingSeries.create({
      data: { title: dto.title, recurrence: dto.recurrence },
    });
  }

  async getOccurrenceAttendance(occurrenceId: string) {
    return this.prisma.attendanceRecord.findMany({ where: { occurrenceId } });
  }

  async updateRecord(recordId: string, status: string) {
    return this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { status: status as 'PRESENT' | 'ABSENT' | 'EXCUSED' },
    });
  }
}
