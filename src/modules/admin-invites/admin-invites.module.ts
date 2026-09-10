import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AdminInvitesService } from './admin-invites.service';
import { AdminInvitesController } from './admin-invites.controller';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [AdminInvitesService],
  controllers: [AdminInvitesController],
  exports: [AdminInvitesService],
})
export class AdminInvitesModule {}
