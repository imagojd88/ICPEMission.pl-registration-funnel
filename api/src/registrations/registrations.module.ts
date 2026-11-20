import { Module } from '@nestjs/common';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { LeadsService } from './leads.service';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PricingModule, NotificationsModule, AuthModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, LeadsService],
  exports: [RegistrationsService, LeadsService],
})
export class RegistrationsModule {}
