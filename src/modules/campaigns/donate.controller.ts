import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { IdempotencyKeyGuard } from '../../common/guards/idempotency-key.guard';
import { AppException } from '../../common/errors/app.exception';
import { CampaignsService } from './campaigns.service';
import { ManualDonateDto } from './dto/manual-donate.dto';
import { WalletService } from '../wallet/wallet.service';

interface CampaignView {
  creatorId: string;
  raisedAmount: Decimal;
}

@ApiTags('campaigns')
@Controller('campaigns')
export class DonateController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly walletService: WalletService,
  ) {}

  @Post(':id/donate-manual')
  @ApiBearerAuth()
  @RequireRole(UserRole.traveler)
  @UseGuards(IdempotencyKeyGuard)
  @ApiOperation({
    summary:
      'Manually credit a campaign donation without a payment processor (MVP).',
  })
  async manualDonate(
    @Param('id') campaignId: string,
    @Body() dto: ManualDonateDto,
    @IdempotencyKey() idempotencyKeyHeader: string,
    @CurrentUser('userId') userId: string,
  ) {
    const campaign = (await this.campaignsService.getDetail(
      campaignId,
      userId,
    )) as CampaignView;

    if (campaign.creatorId === userId) {
      throw AppException.businessRule(
        'You cannot donate to your own campaign.',
      );
    }

    const idempotencyKey = `${idempotencyKeyHeader}-${userId}-${campaignId}`;

    const result = await this.walletService.recordDonation({
      campaignId,
      donorUserId: userId,
      donorDisplayName: dto.donorDisplayName ?? null,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      isAnonymous: dto.isAnonymous ?? false,
      isGift: dto.isGift ?? false,
      giftMessage: dto.giftMessage,
      idempotencyKey,
    });

    const updated = (await this.campaignsService.getDetail(
      campaignId,
      userId,
    )) as CampaignView;

    return {
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      raisedAmount: Number(updated.raisedAmount),
      walletTransactionId: result.transaction.id,
    };
  }
}
