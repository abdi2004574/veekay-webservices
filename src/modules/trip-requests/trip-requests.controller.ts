import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CreateTripRequestDto } from './dto/create-trip-request.dto';
import { CreateSmartReplyTemplateDto } from './dto/create-smart-reply-template.dto';
import { TripRequestFilterDto } from './dto/trip-request-filter.dto';
import { UpdateSmartReplyTemplateDto } from './dto/update-smart-reply-template.dto';
import { UpdateTripRequestStatusDto } from './dto/update-trip-request-status.dto';
import { TripRequestsService } from './trip-requests.service';

@ApiTags('trip-requests')
@ApiBearerAuth()
@Controller('trip-requests')
export class TripRequestsController {
  constructor(private readonly tripRequestsService: TripRequestsService) {}

  // ──── Traveler endpoints ────────────────────────────────────────────────

  @Post()
  @RequireRole(UserRole.traveler)
  @ApiOperation({
    summary: '[Traveler] Create a trip request against an approved agency.',
  })
  async create(
    @Body() dto: CreateTripRequestDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tripRequestsService.create(userId, dto);
  }

  @Get('mine')
  @RequireRole(UserRole.traveler)
  @ApiOperation({
    summary:
      '[Traveler] List my trip requests, filterable by status, cursor-paginated.',
  })
  async listMineForTraveler(
    @Query() filter: TripRequestFilterDto,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tripRequestsService.listMineForTraveler(
      userId,
      filter.status,
      cursor,
      limit ? Number(limit) : 20,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireRole(UserRole.traveler)
  @ApiOperation({
    summary:
      '[Traveler] Cancel my own trip request (pending/in_discussion only).',
  })
  async cancel(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.tripRequestsService.cancel(id, userId);
  }

  // ──── Agency endpoints ──────────────────────────────────────────────────

  @Get()
  @RequireRole(UserRole.agency)
  @ApiOperation({
    summary: '[Agency] List incoming trip requests for my agency.',
  })
  async listForAgency(
    @Query() filter: TripRequestFilterDto,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    const agencyId =
      await this.tripRequestsService.resolveAgencyIdOrThrow(userId);
    return this.tripRequestsService.listForAgency(
      agencyId,
      filter.status,
      cursor,
      limit ? Number(limit) : 20,
    );
  }

  @Patch(':id/status')
  @RequireRole(UserRole.agency)
  @ApiOperation({
    summary: '[Agency] Transition a trip request status per the lifecycle.',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTripRequestStatusDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tripRequestsService.updateStatus(id, userId, dto.status);
  }

  // ──── Shared detail endpoint ────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a trip request detail (traveler must own; agency must own the request).',
  })
  async getDetail(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.tripRequestsService.getDetailForCaller(id, userId, role);
  }

  // ──── Smart-reply template CRUD (agency) ──────────────────────────────

  @Get('smart-replies/templates')
  @RequireRole(UserRole.agency)
  @ApiOperation({ summary: "[Agency] List my agency's smart-reply templates." })
  async listTemplates(@CurrentUser('userId') userId: string) {
    const agencyId =
      await this.tripRequestsService.resolveAgencyIdOrThrow(userId);
    return this.tripRequestsService.listTemplates(agencyId);
  }

  @Post('smart-replies/templates')
  @RequireRole(UserRole.agency)
  @ApiOperation({ summary: '[Agency] Create a smart-reply template.' })
  async createTemplate(
    @Body() dto: CreateSmartReplyTemplateDto,
    @CurrentUser('userId') userId: string,
  ) {
    const agencyId =
      await this.tripRequestsService.resolveAgencyIdOrThrow(userId);
    return this.tripRequestsService.createTemplate(agencyId, dto);
  }

  @Patch('smart-replies/templates/:id')
  @RequireRole(UserRole.agency)
  @ApiOperation({
    summary: "[Agency] Update my agency's smart-reply template.",
  })
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateSmartReplyTemplateDto,
    @CurrentUser('userId') userId: string,
  ) {
    const agencyId =
      await this.tripRequestsService.resolveAgencyIdOrThrow(userId);
    return this.tripRequestsService.updateTemplate(id, agencyId, dto);
  }

  @Delete('smart-replies/templates/:id')
  @RequireRole(UserRole.agency)
  @ApiOperation({
    summary: "[Agency] Delete my agency's smart-reply template.",
  })
  async deleteTemplate(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    const agencyId =
      await this.tripRequestsService.resolveAgencyIdOrThrow(userId);
    await this.tripRequestsService.deleteTemplate(id, agencyId);
  }
}
