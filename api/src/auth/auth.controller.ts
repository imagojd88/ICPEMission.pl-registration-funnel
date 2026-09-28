import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class AdminLoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
  /** „Zapamiętaj mnie" — dłuższa sesja (ADMIN_REMEMBER_TTL, domyślnie 30 dni) z automatycznym przedłużaniem. */
  @IsOptional() @IsBoolean() remember?: boolean;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('admin/login')
  @ApiOperation({ summary: 'Admin login (JWT)' })
  loginAdmin(@Body() dto: AdminLoginDto) {
    return this.auth.loginAdmin(dto.email, dto.password, !!dto.remember);
  }

  /** Przedłużenie sesji admina (panel woła to sam, gdy minie połowa ważności tokenu). */
  @Post('admin/refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Odśwież token admina (sliding session)' })
  refreshAdmin(@Req() req: { user?: { sub?: string; realm?: string; rmb?: boolean } }) {
    return this.auth.refreshAdmin(req.user);
  }
}
