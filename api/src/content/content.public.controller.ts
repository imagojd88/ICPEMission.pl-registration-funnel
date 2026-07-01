import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { EventsService } from '../events/events.service';

/** Publiczne API dla strony Astro — zwraca tylko treść PUBLISHED. */
@ApiTags('content-public')
@Controller('site')
export class ContentPublicController {
  constructor(
    private readonly content: ContentService,
    private readonly events: EventsService,
  ) {}

  @Get('pages')
  @ApiOperation({ summary: 'Opublikowane strony (lekka lista do nawigacji/buildu)' })
  pages() {
    return this.content.publicPages();
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    return this.content.publicPageBySlug(slug);
  }

  @Get('articles')
  @ApiOperation({ summary: 'Opublikowane artykuły (opcjonalnie ?category=, ?limit=)' })
  articles(@Query('category') category?: string, @Query('limit') limit?: string) {
    return this.content.publicArticles(category, limit ? parseInt(limit, 10) : undefined);
  }

  @Get('articles/:slug')
  article(@Param('slug') slug: string) {
    return this.content.publicArticleBySlug(slug);
  }

  @Get('menu')
  menu() {
    return this.content.getMenu();
  }

  @Get('settings')
  settings() {
    return this.content.getSettings();
  }

  @Get('communities')
  @ApiOperation({ summary: 'Wspólnoty mapy świata (opisy PL/EN + współrzędne)' })
  communities() {
    return this.content.publicCommunities();
  }

  @Get('events/upcoming')
  @ApiOperation({ summary: 'Najbliższe aktywne wydarzenia (reużywa listy z modułu events)' })
  upcoming() {
    return this.events.listPublicActive();
  }
}
