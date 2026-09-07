import { Module } from '@nestjs/common';
import { AgenciesController } from './agencies.controller';
import { AdminAgenciesController } from './admin-agencies.controller';
import { AgencyDirectoryController } from './agency-directory.controller';
import { AgenciesService } from './agencies.service';

@Module({
  controllers: [AgenciesController, AgencyDirectoryController, AdminAgenciesController],
  providers: [AgenciesService],
  exports: [AgenciesService],
})
export class AgenciesModule {}
