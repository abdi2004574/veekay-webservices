import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { TripRequestsController } from './trip-requests.controller';
import { TripRequestsService } from './trip-requests.service';

@Module({
  imports: [ChatModule],
  controllers: [TripRequestsController],
  providers: [TripRequestsService],
  exports: [TripRequestsService],
})
export class TripRequestsModule {}
