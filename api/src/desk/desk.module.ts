import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { DeskController } from './desk.controller';
import { DeskService } from './desk.service';
import { DeskAuthGuard } from './desk-auth.guard';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/** Recepcja (/desk/*) + zarządzanie pomocnikami eventu (/admin/instances/:id/staff). */
@Module({
  imports: [AuthModule, RegistrationsModule],
  controllers: [DeskController, StaffController],
  providers: [DeskService, StaffService, DeskAuthGuard],
})
export class DeskModule {}
