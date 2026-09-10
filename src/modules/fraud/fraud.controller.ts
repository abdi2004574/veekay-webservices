import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { FraudService } from './fraud.service';
import { CreateFraudFlagDto } from './dto/create-fraud-flag.dto';
import { ReviewFraudFlagDto } from './dto/review-fraud-flag.dto';
import { FraudFlagFilterDto } from './dto/fraud-flag-filter.dto';

@ApiTags('fraud')
@ApiBearerAuth()
@Controller('admin/fraud')
@UseGuards(PlatformRoleGuard)
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Post('/')
  @RequirePlatformRole(PlatformRole.super_admin)
  @ApiOperation({ summary: 'Create a fraud flag (super_admin only).' })
  async create(
    @Body() dto: CreateFraudFlagDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.fraudService.create(userId, dto);
  }

  @Get('/')
  @RequirePlatformRole(PlatformRole.super_admin)
  @ApiOperation({ summary: 'List fraud flags (super_admin only).' })
  async findAll(
    @Query() filter: FraudFlagFilterDto,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.fraudService.findAll(
      filter,
      cursor,
      limit ? Number(limit) : undefined,
    );
  }

  @Get(':id')
  @RequirePlatformRole(PlatformRole.super_admin)
  @ApiOperation({ summary: 'Get a single fraud flag (super_admin only).' })
  async findOne(@Param('id') id: string) {
    return this.fraudService.findOne(id);
  }

  @Patch(':id')
  @RequirePlatformRole(PlatformRole.super_admin)
  @ApiOperation({ summary: 'Review/update a fraud flag (super_admin only).' })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewFraudFlagDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.fraudService.review(actorId, id, dto);
  }
}
