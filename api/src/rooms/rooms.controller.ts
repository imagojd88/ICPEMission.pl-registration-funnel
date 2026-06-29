import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('rooms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('admin/instances/:id')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post('room-types')
  @ApiOperation({ summary: 'Add room type to instance' })
  addRoomType(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.rooms.addRoomType(id, dto as Parameters<RoomsService['addRoomType']>[1]);
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Generate room pool from types' })
  generateRooms(@Param('id') id: string) {
    return this.rooms.generateRooms(id);
  }

  @Get('room-types')
  @ApiOperation({ summary: 'List room types with rooms' })
  getRoomTypes(@Param('id') id: string) {
    return this.rooms.getRoomTypes(id);
  }
}
