import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('attendance')
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('attendance/check-in')
  @ApiOperation({ summary: 'Self check-in (QR / link)' })
  checkIn(@Body() dto: { occurrenceId: string; guestId?: string; participantName?: string; status?: string }) {
    return this.attendance.checkIn({ ...dto, channel: 'self' });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/meetings')
  @ApiOperation({ summary: 'Create meeting series' })
  createMeetingSeries(@Body() dto: { title: Record<string, string>; recurrence: string }) {
    return this.attendance.createMeetingSeries(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/meetings/:id/occurrences/:occId/attendance')
  @ApiOperation({ summary: 'Get attendance for occurrence' })
  getAttendance(@Param('occId') occId: string) {
    return this.attendance.getOccurrenceAttendance(occId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('admin/attendance/:recordId')
  @ApiOperation({ summary: 'Update attendance record' })
  updateRecord(@Param('recordId') recordId: string, @Body() dto: { status: string }) {
    return this.attendance.updateRecord(recordId, dto.status);
  }
}
