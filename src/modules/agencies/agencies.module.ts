import { Module } from '@nestjs/common';
import { AgenciesController } from './agencies.controller';
import { AgencyDirectoryController } from './agency-directory.controller';
import { AgenciesService } from './agencies.service';

@Module({
  controllers: [AgenciesController, AgencyDirectoryController],
  providers: [AgenciesService],
  exports: [AgenciesService],
})
export class AgenciesModule {}
