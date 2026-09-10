import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireRole } from '../../../common/decorators/require-role.decorator';
import { CallsService } from './calls.service';
import { CreateCallDto } from './dto/create-call.dto';

@ApiTags('calls')
@ApiBearerAuth()
@RequireRole(UserRole.traveler, UserRole.agency)
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a consultation call in an agency conversation.',
  })
  async create(
    @Body() dto: CreateCallDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.callsService.create(dto.conversationId, userId, dto);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End an active call session.' })
  async end(
    @Param('id') sessionId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.callsService.end(sessionId, userId);
  }
}
