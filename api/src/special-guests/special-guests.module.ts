import { Module } from '@nestjs/common';
import { SpecialGuestsController } from './special-guests.controller';
import { SpecialGuestsService } from './special-guests.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SpecialGuestsController],
  providers: [SpecialGuestsService],
})
export class SpecialGuestsModule {}
