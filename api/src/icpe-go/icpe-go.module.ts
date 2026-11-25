import { Module } from '@nestjs/common';
import { IcpeGoController } from './icpe-go.controller';
import { IcpeGoService } from './icpe-go.service';

/** Odczyt danych eventów przez aplikację ICPE Go — docs/18-api-icpe-go.md. */
@Module({
  controllers: [IcpeGoController],
  providers: [IcpeGoService],
})
export class IcpeGoModule {}
