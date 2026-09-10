import { Module } from '@nestjs/common';
import { FraudService } from './fraud.service';
import { FraudController } from './fraud.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';

@Module({
  imports: [PrismaModule, AdminAuditLogModule],
  controllers: [FraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}