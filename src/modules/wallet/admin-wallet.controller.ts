import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole, WithdrawalStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { RequirePlatformRole } from '../../common/decorators/require-platform-role.decorator';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { AdminCreditWalletDto } from './dto/admin-credit-wallet.dto';
import { ReviewWithdrawalRequestDto } from './dto/review-withdrawal-request.dto';
import { WalletService } from './wallet.service';

@ApiTags('admin-wallet')
@ApiBearerAuth()
@RequirePlatformRole(PlatformRole.super_admin)
@Controller('admin/wallet')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('withdrawals')
  @ApiOperation({
    summary: '[Super Admin] List all withdrawal requests across the platform.',
  })
  async listAllWithdrawals(
    @Query('status') status: WithdrawalStatus | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.walletService.listAllWithdrawals(
      status,
      cursor,
      limit ? Number(limit) : 20,
    );
  }

  @Get('withdrawals/:id')
  @ApiOperation({ summary: '[Super Admin] Get one withdrawal request detail.' })
  async getWithdrawalDetail(@Param('id') id: string) {
    return this.walletService.getWithdrawalDetailForAdmin(id);
  }

  @Patch('withdrawals/:id/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @ApiOperation({
    summary: '[Super Admin] Approve or reject a requested withdrawal.',
  })
  async reviewWithdrawal(
    @Param('id') id: string,
    @Body() dto: ReviewWithdrawalRequestDto,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.walletService.reviewWithdrawal(adminUserId, id, dto);
  }

  @Post('withdrawals/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @ApiOperation({
    summary:
      '[Super Admin] Manually mark an approved withdrawal as paid (MVP-only ops reconciliation; replaced by processor webhook in #6).',
  })
  async markWithdrawalPaid(
    @Param('id') id: string,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.walletService.markWithdrawalPaid(
      'admin-mvp-ops',
      id,
      idempotencyKey,
    );
  }

  @Post('wallets/:userId/credit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @ApiOperation({ summary: '[Super Admin] Manually credit a user wallet.' })
  async adminCredit(
    @Param('userId') targetUserId: string,
    @Body() dto: AdminCreditWalletDto,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.walletService.adminCredit(
      adminUserId,
      targetUserId,
      dto,
      idempotencyKey,
    );
  }

  @Patch('withdrawals/:id/refund-note')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Super Admin] Update refund note on a withdrawal.' })
  async updateRefundNote(
    @Param('id') id: string,
    @Body('refundNote') refundNote: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.walletService.updateRefundNote(adminUserId, id, refundNote);
  }
}
