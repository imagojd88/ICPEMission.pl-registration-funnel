import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('places')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('admin/places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista zapisanych miejsc' })
  list() {
    return this.places.list();
  }

  @Post()
  @ApiOperation({ summary: 'Dodaj miejsce (idempotentnie po label)' })
  create(@Body() dto: { label: string }) {
    return this.places.create(dto.label);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Usuń miejsce' })
  remove(@Param('id') id: string) {
    return this.places.remove(id);
  }
}
