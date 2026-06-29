import { Controller, Post, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GuestsService } from './guests.service';

@ApiTags('guests')
@Controller()
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Post('auth/guest/register')
  @ApiOperation({ summary: 'Guest account registration' })
  register(@Body() dto: { email: string; password?: string; firstName: string; lastName: string; phone?: string; locale?: string }) {
    return this.guests.register(dto);
  }

  // Note: guest login, magic-link, profile update require guestId from JWT (not implemented
  // in this scaffold — guest JWT realm is a future extension). Stubs provided for contract.
  @Post('auth/guest/login')
  @ApiOperation({ summary: 'Guest login (stub)' })
  login(@Body() _dto: { email: string; password: string }) {
    return { message: 'Guest login not yet implemented — use magic-link' };
  }

  @Post('auth/guest/magic-link')
  @ApiOperation({ summary: 'Request magic link (stub)' })
  magicLink(@Body() _dto: { email: string }) {
    return { message: 'Magic link sent (stub — MAIL_MODE=log)' };
  }

  @Get('guest/me/registrations')
  @ApiOperation({ summary: 'My registrations (requires guest JWT — stub)' })
  myRegistrations() {
    return { message: 'Requires guest JWT auth (not yet implemented)' };
  }

  @Put('guest/me/profile')
  @ApiOperation({ summary: 'Update guest profile (stub)' })
  updateProfile(@Body() _dto: unknown) {
    return { message: 'Requires guest JWT auth (not yet implemented)' };
  }
}
