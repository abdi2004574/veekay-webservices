import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

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
}
bootstrap();
