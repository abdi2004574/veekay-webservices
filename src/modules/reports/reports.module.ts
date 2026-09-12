import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ModerationReportIntakeProcessor } from './processors/moderation-report-intake.processor';
import { AppConfig } from '../../config/configuration';

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}

@Module({
  imports: [
    PrismaModule,
    AdminAuditLogModule,
    ConfigModule,
    BullModule.registerQueueAsync({
      name: 'moderation',
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: parseRedisUrl(config.get('redis.url', { infer: true })),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ModerationReportIntakeProcessor],
  exports: [ReportsService],
})
export class ReportsModule {}
