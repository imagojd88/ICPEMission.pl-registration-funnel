"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const auth_service_1 = require("./auth/auth.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    try {
        await app.get(auth_service_1.AuthService, { strict: false }).ensureBootstrap();
    }
    catch (e) {
        console.error('Bootstrap admin/token pominięty:', e.message);
    }
    const prefix = process.env.API_PREFIX?.replace(/^\/+|\/+$/g, '');
    if (prefix)
        app.setGlobalPrefix(prefix);
    const docsPath = prefix ? `${prefix}/docs` : 'docs';
    const corsEnv = process.env.CORS_ORIGIN;
    app.enableCors({
        origin: corsEnv ? corsEnv.split(',').map((o) => o.trim()) : true,
        credentials: false,
        allowedHeaders: ['Authorization', 'Content-Type'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
    }));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('ICPE Registration API')
        .setDescription('Backend for ICPE Mission event registration system')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup(docsPath, app, document);
    const port = parseInt(process.env.PORT ?? '3000', 10);
    await app.listen(port);
    console.log(`ICPE API listening on http://localhost:${port}${prefix ? '/' + prefix : ''}`);
    console.log(`Swagger docs: http://localhost:${port}/${docsPath}`);
    console.log(`PAYMENTS_MODE=${process.env.PAYMENTS_MODE ?? 'mock'}, MAIL_MODE=${process.env.MAIL_MODE ?? 'log'}`);
}
bootstrap();
//# sourceMappingURL=main.js.map