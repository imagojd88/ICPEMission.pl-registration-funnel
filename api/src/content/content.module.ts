import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { DeployHookService } from './deploy-hook.service';
import { ContentAdminController } from './content.admin.controller';
import { ContentPublicController } from './content.public.controller';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [ContentAdminController, ContentPublicController],
  providers: [ContentService, DeployHookService],
  exports: [ContentService],
})
export class ContentModule {}
