import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AdminAuditLogService } from './admin-audit-log.service';

@Module({
  imports: [PrismaModule],
  providers: [AdminAuditLogService],
  controllers: [AdminAuditLogController],
  exports: [AdminAuditLogService],
})
export class AdminAuditLogModule {}
