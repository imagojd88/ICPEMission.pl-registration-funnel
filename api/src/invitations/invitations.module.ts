import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { GuestInvitesService } from './guest-invites.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, GuestInvitesService],
})
export class InvitationsModule {}
