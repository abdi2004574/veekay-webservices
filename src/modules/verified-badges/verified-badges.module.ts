import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogModule } from '../admin-audit-log/admin-audit-log.module';
import { VerifiedBadgesController } from './verified-badges.controller';
import { VerifiedBadgesService } from './verified-badges.service';

@Module({
  imports: [PrismaModule, AdminAuditLogModule],
  controllers: [VerifiedBadgesController],
  providers: [VerifiedBadgesService],
  exports: [VerifiedBadgesService],
})
export class VerifiedBadgesModule {}
