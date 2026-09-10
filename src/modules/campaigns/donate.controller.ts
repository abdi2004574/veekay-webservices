import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { DonateDto } from './dto/donate.dto';
import { StripeConnectService } from '../payments/stripe-connect.service';
import { StripeFundingProvider } from '../wallet/funding/stripe-funding.provider';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

@ApiTags('campaigns')
@Controller('campaigns')
export class DonateController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly stripeFundingProvider: StripeFundingProvider,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Post(':id/donate')
  @Public()
  @ApiOperation({
    summary: 'Create a Stripe PaymentIntent for a campaign donation.',
  })
  async createDonation(
    @Param('id') campaignId: string,
    @Body() dto: DonateDto,
    @Req() req: Request,
    @CurrentUser('userId') userId?: string,
  ) {
    const campaign = await this.campaignsService.getDetail(
      campaignId,
      userId ?? 'anonymous',
    );

    const platformFeePercent = this.configService.get(
      'stripe.platformFeePercent',
      { infer: true },
    );

    const feeAmount =
      platformFeePercent > 0
        ? Math.round(((dto.amount * platformFeePercent) / 100) * 100)
        : 0;

    const metadata: Record<string, string> = {
      campaignId,
      donorUserId: userId ?? 'anonymous',
      donorDisplayName: dto.donorDisplayName ?? 'Anonymous',
      isAnonymous: String(dto.isAnonymous ?? false),
      isGift: String(dto.isGift ?? false),
      giftMessage: dto.giftMessage ?? '',
    };

    const paymentIntent = await this.stripeFundingProvider
      .getStripeInstance()
      .paymentIntents.create(
        {
          amount: Math.round(dto.amount * 100),
          currency: dto.currency.toLowerCase(),
          metadata,
          description: dto.isGift
            ? `Gift donation for campaign ${campaignId}`
            : `Donation for campaign ${campaignId}`,
          application_fee_amount: feeAmount > 0 ? feeAmount : undefined,
        },
        {
          idempotencyKey: `donate-${campaignId}-${Date.now()}`,
        },
      );

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: dto.amount,
      currency: dto.currency,
    };
  }
}
