import { Controller, Post, Get, Param, UploadedFile, UseInterceptors, UseGuards, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { UploadsService, UploadedFileLike } from './uploads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('uploads')
@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Post('admin/uploads')
  @ApiOperation({ summary: 'Wgraj obrazek (np. tło hero) — zwraca { path: "/uploads/:id" }' })
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedFileLike) {
    return this.uploads.save(file);
  }

  @Get('uploads/:id')
  @ApiOperation({ summary: 'Pobierz wgrany obrazek' })
  async serve(@Param('id') id: string, @Res() res: Response) {
    const { mimeType, data } = await this.uploads.get(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(data);
  }
}
