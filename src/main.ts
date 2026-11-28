import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { configureGlobalFetchProxy } from './common/network';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureGlobalFetchProxy();

  app.use(json({ limit: process.env.REQUEST_BODY_LIMIT || '25mb' }));
  app.use(urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT || '25mb' }));

  app.setGlobalPrefix('api');

  // Keep API docs available in development, but disabled in production by default.
  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === 'true' || process.env.NODE_ENV !== 'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Jersey Design API')
      .setDescription('球衣定制与 AI 设计服务 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument, {
      useGlobalPrefix: true,
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const resourceBaseDir = process.env.RESOURCE_BASE_DIR || 'E:\\兼职\\svgs-download\\py';
  app.useStaticAssets(resourceBaseDir, {
    prefix: '/resources/',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
    },
  });

  app.enableCors({
    origin: corsOrigin,
    credentials: false,
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`Application is running on http://localhost:${port}`);
}
bootstrap();
