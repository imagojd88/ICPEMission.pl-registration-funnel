import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';
import { PosthogInsightsService } from './posthog-insights.service';

@ApiTags('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('admin/instances/:id')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly posthog: PosthogInsightsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard eventu: osoby, tempo zapisów do celu, finanse, zakwaterowanie, dodatki, diety, alarmy (z bazy)' })
  get(@Param('id') id: string) {
    return this.dashboard.forInstance(id);
  }

  @Get('dashboard/analytics')
  @ApiOperation({ summary: 'Dashboard eventu: lejek, urządzenia, języki, źródła wejść z PostHoga (endpoint registration_event_dashboard)' })
  async analytics(@Param('id') id: string, @Query('days') days?: string, @Query('refresh') refresh?: string) {
    const inst = (await (this.prisma as unknown as {
      eventInstance: { findUnique: (a: unknown) => Promise<{ series?: { page?: { slug?: string } | null } | null } | null> };
    }).eventInstance.findUnique({
      where: { id },
      select: { series: { select: { page: { select: { slug: true } } } } },
    }));
    if (!inst) throw new NotFoundException('Instance not found');
    const slug = inst.series?.page?.slug;
    if (!slug) throw new NotFoundException('Event nie ma strony rejestracji (slug).');
    return { slug, ...(await this.posthog.forSlug(slug, Number(days) || 30, refresh === '1')) };
  }

  @Patch('dashboard-target')
  @ApiOperation({ summary: 'Cel frekwencji eventu (np. minimum osób z umowy z ośrodkiem) — tylko informacja dla dashboardu' })
  setTarget(@Param('id') id: string, @Body() body: { targetPeople?: number | null }) {
    return this.dashboard.setTarget(id, body?.targetPeople ?? null);
  }
}
