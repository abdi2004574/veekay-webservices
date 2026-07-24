import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { MediaAssetsService } from './media-assets.service';

@Module({
  controllers: [StorageController],
  providers: [StorageService, MediaAssetsService],
  exports: [StorageService, MediaAssetsService],
})
export class StorageModule {}
