import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgenciesService } from './agencies.service';

@ApiTags('agencies')
@ApiBearerAuth()
@Controller('agencies')
export class AgencyDirectoryController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Get()
  @ApiOperation({ summary: 'Browse approved agencies, most reputable first.' })
  async list(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
  ) {
    return this.agenciesService.listDirectory(
      cursor,
      limit ? Number(limit) : undefined,
      search,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Public agency profile.' })
  async getById(@Param('id') id: string) {
    return this.agenciesService.getPublicDetail(id);
  }
}
