import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('summary')
  @ApiOperation({ summary: 'KPI dashboard summary (Personal OS integration)' })
  getSummary() {
    return this.admin.getSummary();
  }

  @Patch('registrations/:id/status')
  @ApiOperation({ summary: 'Update registration status' })
  updateStatus(@Param('id') id: string, @Body() dto: { status: string }) {
    return this.admin.updateRegistrationStatus(id, dto.status);
  }

  @Post('registrations/:id/mark-paid')
  @ApiOperation({ summary: 'Mark registration as paid (manual bank transfer)' })
  markPaid(@Param('id') id: string) {
    return this.admin.markPaid(id);
  }

  @Post('registrations/:id/assign-room')
  @ApiOperation({ summary: 'Assign room to registration' })
  assignRoom(
    @Param('id') id: string,
    @Body() dto: { roomId: string; participantId?: string },
  ) {
    return this.admin.assignRoom(id, dto.roomId, undefined, dto.participantId);
  }
}
