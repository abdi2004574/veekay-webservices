import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as Sentry from '@sentry/nestjs';
import helmet from 'helmet';
import compression from 'compression';
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

type RawBodyRequest = Request & { rawBody?: Buffer };

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  environment: process.env.NODE_ENV,
  tracesSampleRate: isProd ? 0.1 : 1.0,
  profilesSampleRate: isProd ? 0.1 : 1.0,
  integrations: [
    Sentry.httpIntegration(),
    ...(typeof Sentry.prismaIntegration === 'function'
      ? [Sentry.prismaIntegration()]
      : []),
  ],
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean)
        : true,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  app.use(
    express.json({
      verify: (req: Request, _res: Response, buffer: Buffer) => {
        (req as RawBodyRequest).rawBody = buffer;
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = app.get(ConfigService<AppConfig, true>);

  if (config.get('swaggerEnabled', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Veakay API')
      .setDescription('Traveler, agency, and admin API for Veakay.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/v1/docs', app, document);
  }

  const port = config.get('port', { infer: true });
  await app.listen(port);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await Sentry.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}
void bootstrap();
