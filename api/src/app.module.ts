import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { PricingModule } from './pricing/pricing.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { RoomsModule } from './rooms/rooms.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AttendanceModule } from './attendance/attendance.module';
import { GuestsModule } from './guests/guests.module';
import { AdminModule } from './admin/admin.module';
import { RsvpModule } from './rsvp/rsvp.module';
import { UploadsModule } from './uploads/uploads.module';
import { PlacesModule } from './places/places.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
    PrismaModule,
    AuthModule,
    EventsModule,
    PricingModule,
    RegistrationsModule,
    RoomsModule,
    PaymentsModule,
    NotificationsModule,
    AttendanceModule,
    GuestsModule,
    AdminModule,
    RsvpModule,
    UploadsModule,
    PlacesModule,
  ],
})
export class AppModule {}
