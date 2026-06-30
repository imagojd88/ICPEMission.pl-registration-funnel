import { Controller, Get, Post, Put, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('events')
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('r/:slug')
  @ApiOperation({ summary: 'Resolve registration page → active instance' })
  getBySlug(@Param('slug') slug: string) {
    return this.events.findBySlug(slug);
  }

  @Get('r/:slug/config')
  @ApiOperation({ summary: 'Form config for a given locale' })
  getConfig(@Param('slug') slug: string, @Query('locale') locale: string = 'pl') {
    return this.events.getSlugConfig(slug, locale);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/series')
  @ApiOperation({ summary: 'Create new event series + first instance' })
  createSeries(@Body() dto: Record<string, unknown>) {
    return this.events.createSeries(dto as Parameters<EventsService['createSeries']>[0]);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/series/:id/page')
  @ApiOperation({ summary: 'Configure registration page (slug, theme, fields)' })
  configPage(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.events.configureSeriesPage(id, dto as Parameters<EventsService['configureSeriesPage']>[1]);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/series/:id/publish')
  @ApiOperation({ summary: 'Publish series page' })
  publish(@Param('id') id: string) {
    return this.events.publishSeries(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/instances')
  @ApiOperation({ summary: 'List instances' })
  listInstances(@Query('status') status?: string) {
    return this.events.listInstances(status);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/instances/:id')
  @ApiOperation({ summary: 'Get instance detail (Personal OS contract)' })
  getInstance(@Param('id') id: string) {
    return this.events.getInstanceContract(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/clone')
  @ApiOperation({ summary: 'Clone instance' })
  clone(@Param('id') id: string) {
    return this.events.cloneInstance(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('admin/instances/:id/pricing')
  @ApiOperation({ summary: 'Update pricing config' })
  updatePricing(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.events.updatePricing(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('admin/instances/:id')
  @ApiOperation({ summary: 'Edit existing event instance (core fields, pricing, payments)' })
  updateInstance(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.events.updateInstance(id, dto);
  }
}
