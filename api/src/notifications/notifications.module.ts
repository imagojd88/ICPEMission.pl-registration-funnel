import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MailController } from './mail.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MailController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
