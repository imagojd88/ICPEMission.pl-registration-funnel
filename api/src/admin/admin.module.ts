import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { RegistrationAdminService } from './registration-admin.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PosthogInsightsService } from './posthog-insights.service';

@Module({
  imports: [AuthModule, RoomsModule, RegistrationsModule],
  controllers: [AdminController, DashboardController],
  providers: [AdminService, RegistrationAdminService, DashboardService, PosthogInsightsService],
})
export class AdminModule {}
