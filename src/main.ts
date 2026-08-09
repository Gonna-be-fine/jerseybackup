import { NestFactory } from '@nestjs/core';
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

  await app.listen(process.env.PORT ?? 3000);
  console.log('Application is running on http://localhost:3000');
}
bootstrap();
