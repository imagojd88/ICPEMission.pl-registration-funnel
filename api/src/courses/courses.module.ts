import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { R2StorageService } from './r2-storage.service';
import { CoursesService } from './courses.service';
import { MemberService } from './member.service';
import { MemberAuthGuard } from './member-auth.guard';
import { CourseTrackingService } from './course-tracking.service';
import { CourseReleaseService } from './course-release.service';
import { CoursesAdminController } from './courses.admin.controller';
import { CoursesPublicController } from './courses.public.controller';

/** „Formacja online" — kursy, panel kursanta, Cloudflare R2 (wideo). Spec: docs/13-handoff-formacja-online.md */
@Module({
  imports: [AuthModule, ContentModule, NotificationsModule],
  controllers: [CoursesAdminController, CoursesPublicController],
  providers: [R2StorageService, CoursesService, MemberService, MemberAuthGuard, CourseTrackingService, CourseReleaseService],
})
export class CoursesModule {}
