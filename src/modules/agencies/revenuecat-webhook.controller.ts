import {
  Body,
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  RevenueCatWebhookEnvelope,
  RevenueCatWebhookResponse,
} from './revenuecat-webhook.dto';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import type { Request } from 'express';

@ApiTags('revenuecat')
@Controller('revenuecat')
export class RevenueCatWebhookController {
  constructor(
    private readonly revenuecatWebhookService: RevenueCatWebhookService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RevenueCatWebhookEnvelope })
  @ApiOperation({
    summary: 'RevenueCat webhook endpoint for subscription events.',
  })
  @ApiResponse({ status: 200, description: 'Webhook received and processed.' })
  @ApiResponse({
    status: 400,
    description: 'Malformed payload or unsupported event.',
  })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature.' })
  @ApiResponse({ status: 404, description: 'Agency not found.' })
  async webhook(
    @Body() envelope: RevenueCatWebhookEnvelope,
    @Headers('X-RevenueCat-Webhook-Signature') signature: string | undefined,
    @Req() req: Request,
  ): Promise<RevenueCatWebhookResponse> {
    const rawBody = (
      (req as any).rawBody ?? Buffer.from(JSON.stringify(envelope))
    ).toString('utf8');

    try {
      const result = await this.revenuecatWebhookService.processWebhook(
        envelope,
        signature ?? '',
        rawBody,
      );
      if (result === null) {
        return { received: true };
      }
      return { received: true, eventId: result.eventId };
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'Invalid webhook signature') {
        throw new UnauthorizedException('Invalid webhook signature');
      }
      if (message === 'Agency not found for RevenueCat user') {
        throw new NotFoundException('Agency not found');
      }
      if (
        message === 'Invalid event ID' ||
        message ===
          'Unknown active entitlement - ignoring to prevent downgrade' ||
        message === 'Invalid tier mapping result' ||
        message === 'Could not claim event for processing'
      ) {
        throw new BadRequestException(message);
      }
      throw error;
    }
  }
}
