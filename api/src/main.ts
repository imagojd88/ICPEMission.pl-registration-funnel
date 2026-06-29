import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Bootstrap admina i tokenu serwisowego z ENV (gdy baza pusta).
  try {
    await app.get(AuthService, { strict: false }).ensureBootstrap();
  } catch (e) {
    console.error('Bootstrap admin/token pominięty:', (e as Error).message);
  }

  // Prefiks API — w produkcji ustaw API_PREFIX=api, by front i API żyły pod jedną
  // subdomeną (front w /, API w /api/...) bez kolizji tras (/r/:slug, /admin/*).
  const prefix = process.env.API_PREFIX?.replace(/^\/+|\/+$/g, '');
  if (prefix) app.setGlobalPrefix(prefix);
  const docsPath = prefix ? `${prefix}/docs` : 'docs';

  // CORS — frontend (przeglądarka) + klient desktopowy Personal OS (Electron).
  // Electron wysyła requesty z origin 'null'/file:// lub bez origin; token jest w nagłówku
  // Authorization (Bearer), nie używamy ciasteczek → bezpiecznie odbić dowolny origin.
  const corsEnv = process.env.CORS_ORIGIN; // np. "https://app.icpe.pl,http://localhost:5173"
  app.enableCors({
    origin: corsEnv ? corsEnv.split(',').map((o) => o.trim()) : true,
    credentials: false,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('ICPE Registration API')
    .setDescription('Backend for ICPE Mission event registration system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(docsPath, app, document);

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`ICPE API listening on http://localhost:${port}${prefix ? '/' + prefix : ''}`);
  console.log(`Swagger docs: http://localhost:${port}/${docsPath}`);
  console.log(`PAYMENTS_MODE=${process.env.PAYMENTS_MODE ?? 'mock'}, MAIL_MODE=${process.env.MAIL_MODE ?? 'log'}`);
}

bootstrap();
