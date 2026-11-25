import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TpayService } from './tpay.service';
import { OnlinePaymentsService } from './online-payments.service';
import { RefundsService } from './refunds.service';
import { AuthModule } from '../auth/auth.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { NotificationsModule } from '../notifications/notifications.module';

// RegistrationsModule (PaymentPlanService) i NotificationsModule nie importują PaymentsModule,
// więc zależność jest jednokierunkowa. Przypomnienia o ratach potrzebują tylko informacji
// „czy Tpay jest skonfigurowany” i biorą ją z czystego helpera `tpay-config.ts`, nie z tego modułu.
@Module({
  imports: [AuthModule, RegistrationsModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, TpayService, OnlinePaymentsService, RefundsService],
})
export class PaymentsModule {}
