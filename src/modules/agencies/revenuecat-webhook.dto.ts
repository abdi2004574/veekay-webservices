import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export const REVENUECAT_TIMESTAMP_TOLERANCE_SECONDS = 300;

export enum RevenueCatEventType {
  INITIAL_PURCHASE = 'INITIAL_PURCHASE',
  RENEWAL = 'RENEWAL',
  CANCELLATION = 'CANCELLATION',
  EXPIRATION = 'EXPIRATION',
  PRODUCT_CHANGE = 'PRODUCT_CHANGE',
  UNCANCELLATION = 'UNCANCELLATION',
  BILLING_ISSUE = 'BILLING_ISSUE',
  NON_SUBSCRIPTION_PURCHASE = 'NON_SUBSCRIPTION_PURCHASE',
  SUBSCRIPTION_PAUSED = 'SUBSCRIPTION_PAUSED',
  SUBSCRIPTION_EXTENDED = 'SUBSCRIPTION_EXTENDED',
  OFFER_REDEEMED = 'OFFER_REDEEMED',
}

export const SUBSCRIPTION_EVENT_TYPES = new Set<RevenueCatEventType>([
  RevenueCatEventType.INITIAL_PURCHASE,
  RevenueCatEventType.RENEWAL,
  RevenueCatEventType.CANCELLATION,
  RevenueCatEventType.EXPIRATION,
  RevenueCatEventType.PRODUCT_CHANGE,
  RevenueCatEventType.UNCANCELLATION,
  RevenueCatEventType.BILLING_ISSUE,
  RevenueCatEventType.NON_SUBSCRIPTION_PURCHASE,
  RevenueCatEventType.SUBSCRIPTION_PAUSED,
  RevenueCatEventType.SUBSCRIPTION_EXTENDED,
  RevenueCatEventType.OFFER_REDEEMED,
]);

export enum RevenueCatEntitlement {
  BASIC = 'basic',
  PREMIUM = 'premium',
  FEATURED = 'featured',
}

export class RevenueCatAlias {
  @ApiProperty({ description: 'Alias user ID' })
  @IsString()
  id: string;
}

export class RevenueCatWebhookEvent {
  @ApiProperty({ description: 'Event type' })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({ description: 'Unique event id for idempotency' })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({ description: 'Event timestamp (Unix epoch milliseconds)' })
  @IsNumber()
  event_timestamp_ms: number;

  @ApiProperty({ description: 'App user id set by mobile to backend user ID' })
  @IsOptional()
  @IsString()
  app_user_id?: string;

  @ApiProperty({ description: 'Original app user id from RevenueCat' })
  @IsOptional()
  @IsString()
  original_app_user_id?: string;

  @ApiProperty({ description: 'Alias IDs linking to backend user IDs' })
  @IsOptional()
  @Type(() => RevenueCatAlias)
  aliases?: RevenueCatAlias[];

  @ApiProperty({
    description: 'Entitlement IDs (active entitlements for this event)',
  })
  @IsOptional()
  entitlement_ids?: string[];

  @ApiProperty({ description: 'Product ID associated with the event' })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiProperty({ description: 'Environment (SANDBOX or PRODUCTION)' })
  @IsOptional()
  @IsString()
  environment?: string;
}

export class RevenueCatWebhookEnvelope {
  @ApiProperty({ description: 'RevenueCat API version' })
  @IsString()
  api_version: string;

  @ApiProperty({ description: 'The event object' })
  @ValidateNested()
  @Type(() => RevenueCatWebhookEvent)
  event: RevenueCatWebhookEvent;
}

export class RevenueCatWebhookResponse {
  @ApiProperty({ description: 'Whether the webhook was received' })
  received: boolean;

  @ApiProperty({ description: 'Event id that was processed', required: false })
  @IsOptional()
  @IsString()
  eventId?: string;
}

export function mapEntitlementToTier(
  entitlementName: string,
  tierMapping: Record<string, string>,
): string | null {
  const normalized = entitlementName.toLowerCase();
  if (tierMapping[normalized]) {
    return tierMapping[normalized];
  }
  return null;
}

export function mapProductToTier(
  productId: string,
  tierMapping: Record<string, string>,
): string | null {
  if (tierMapping[productId]) {
    return tierMapping[productId];
  }
  return null;
}

export function isCancellationOrExpirationEvent(type: string): boolean {
  return (
    type === RevenueCatEventType.CANCELLATION ||
    type === RevenueCatEventType.EXPIRATION ||
    type === RevenueCatEventType.BILLING_ISSUE
  );
}

export function isActiveSubscriptionEvent(type: string): boolean {
  return (
    type === RevenueCatEventType.INITIAL_PURCHASE ||
    type === RevenueCatEventType.RENEWAL ||
    type === RevenueCatEventType.PRODUCT_CHANGE ||
    type === RevenueCatEventType.UNCANCELLATION ||
    type === RevenueCatEventType.NON_SUBSCRIPTION_PURCHASE ||
    type === RevenueCatEventType.SUBSCRIPTION_EXTENDED ||
    type === RevenueCatEventType.OFFER_REDEEMED
  );
}

export function determineTierFromEvent(
  event: RevenueCatWebhookEvent,
  tierMapping: Record<string, string>,
): string {
  if (isCancellationOrExpirationEvent(event.type)) {
    return 'basic';
  }

  if (isActiveSubscriptionEvent(event.type)) {
    if (event.entitlement_ids && event.entitlement_ids.length > 0) {
      for (const entitlementId of event.entitlement_ids) {
        const tier = mapEntitlementToTier(entitlementId, tierMapping);
        if (tier) {
          return tier;
        }
      }
    }

    if (event.product_id) {
      const tier = mapProductToTier(event.product_id, tierMapping);
      if (tier) {
        return tier;
      }
    }

    return 'basic';
  }

  return 'basic';
}
