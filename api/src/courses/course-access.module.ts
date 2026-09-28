import { Global, Module } from '@nestjs/common';
import { CourseAccessService } from './course-access.service';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Globalny — CourseAccessService wstrzykują serwisy zgłoszeń/płatności/zaproszeń/admina,
 * żeby po zmianie statusu zgłoszenia uzgodnić dostęp do kursów (bez importów cyklicznych).
 */
@Global()
@Module({
  imports: [NotificationsModule],
  providers: [CourseAccessService],
  exports: [CourseAccessService],
})
export class CourseAccessModule {}
