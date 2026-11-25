import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { RegistrationAdminService } from './registration-admin.service';

@Module({
  imports: [AuthModule, RoomsModule, RegistrationsModule],
  controllers: [AdminController],
  providers: [AdminService, RegistrationAdminService],
})
export class AdminModule {}
