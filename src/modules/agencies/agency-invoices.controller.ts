import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/require-verified-email.decorator';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { AgencyInvoicesService } from './agency-invoices.service';
import { AgencyInvoiceQueryDto } from './dto/agency-invoice-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';

@ApiTags('agency-invoices')
@ApiBearerAuth()
@Controller('agency/invoices')
@RequireRole(UserRole.agency)
@RequireVerifiedEmail()
export class AgencyInvoicesController {
  constructor(private readonly agencyInvoicesService: AgencyInvoicesService) {}

  private getAgencyId(req: Request): string {
    const agencyId = (req as Request & { agencyId: string }).agencyId;
    if (!agencyId) throw new Error('Agency ID not found on request');
    return agencyId;
  }

  @Get()
  @ApiOperation({ summary: 'List agency invoices with pagination and status filter' })
  async listInvoices(
    @Req() req: Request,
    @Query() query: AgencyInvoiceQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    const agencyId = this.getAgencyId(req);
    return this.agencyInvoicesService.listInvoices(agencyId, query.status, query.cursor, query.limit ? Number(query.limit) : 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice detail (owner only)' })
  async getInvoice(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    const agencyId = this.getAgencyId(req);
    return this.agencyInvoicesService.getInvoice(agencyId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update invoice status (owner only)' })
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
    @CurrentUser('userId') userId: string,
  ) {
    const agencyId = this.getAgencyId(req);
    return this.agencyInvoicesService.updateStatus(agencyId, id, dto.status);
  }
}
