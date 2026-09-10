import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgenciesController } from './agencies.controller';
import { AdminAgenciesController } from './admin-agencies.controller';
import { AgencyDirectoryController } from './agency-directory.controller';
import { AgenciesService } from './agencies.service';

@Module({
  imports: [NotificationsModule],
  controllers: [
    AgenciesController,
    AgencyDirectoryController,
    AdminAgenciesController,
  ],
  providers: [AgenciesService],
  exports: [AgenciesService],
})
export class AgenciesModule {}
