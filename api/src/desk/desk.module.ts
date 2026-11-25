import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { DeskController } from './desk.controller';
import { DeskService } from './desk.service';
import { DeskAuthGuard } from './desk-auth.guard';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { DeskAdminController } from './desk-admin.controller';
import { DeskAdminService } from './desk-admin.service';

/** Recepcja (/desk/*) + zarządzanie pomocnikami eventu (/admin/instances/:id/staff) + wgląd admina w dziennik i prośby. */
@Module({
  imports: [AuthModule, RegistrationsModule],
  controllers: [DeskController, StaffController, DeskAdminController],
  providers: [DeskService, StaffService, DeskAuthGuard, DeskAdminService],
})
export class DeskModule {}
