import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SpecialGuestsService, type SavedGuestInput } from './special-guests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('special-guests')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('admin/special-guests')
export class SpecialGuestsController {
  constructor(private readonly guests: SpecialGuestsService) {}

  @Get()
  @ApiOperation({ summary: 'Biblioteka gości specjalnych' })
  list() {
    return this.guests.list();
  }

  @Post()
  @ApiOperation({ summary: 'Zapisz gościa w bibliotece (z id → aktualizacja; bez id → po imieniu PL, bez duplikatów)' })
  save(@Body() dto: SavedGuestInput) {
    return this.guests.save(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Usuń gościa z biblioteki' })
  remove(@Param('id') id: string) {
    return this.guests.remove(id);
  }
}
