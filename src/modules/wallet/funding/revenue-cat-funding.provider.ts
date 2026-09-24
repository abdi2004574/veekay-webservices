import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import {
  FundingDepositRequest,
  FundingProviderResult,
  IFundingProvider,
} from '../interfaces/funding-provider.interface';

/**
 * RevenueCat funding provider.
 *
 * Verifies a RevenueCat in-app purchase (a donation) by calling the
 * RevenueCat REST API v2 projects endpoint and validating the returned
 * purchase object against the requested amount, currency, product id,
 * ownership status, and environment.
 *
 * The provider is intentionally strict: any validation failure returns
 * { ok: false, message } rather than throwing, so WalletService can
 * surface a clean rejection. The only cases that throw are missing
 * configuration (projectId / apiKey), which represent a deployment
 * misconfiguration rather than a per-request outcome.
 */
interface RevenueCatPurchaseItem {
  id?: string;
  product_id?: string;
  status?: string;
  revenue_in_usd?: { currency?: string; gross?: number };
  environment?: string;
  store_purchase_identifier?: string | number;
}

interface RevenueCatPurchasesResponse {
  object?: string;
  items?: RevenueCatPurchaseItem[];
}

const PRODUCT_ID_PATTERN = /^donation_\d+$/;
const AMOUNT_TOLERANCE = 0.005;
const REQUEST_TIMEOUT_MS = 10000;

@Injectable()
export class RevenueCatFundingProvider implements IFundingProvider {
  readonly name = 'revenuecat';
  private readonly logger = new Logger(RevenueCatFundingProvider.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async deposit(
    request: FundingDepositRequest,
  ): Promise<FundingProviderResult> {
    const projectId = this.configService.get('revenuecat.projectId', {
      infer: true,
    });
    const apiKey = this.configService.get('revenuecat.apiKey', {
      infer: true,
    });
    const allowSandbox =
      this.configService.get('revenuecat.allowSandbox', { infer: true }) ??
      false;

    if (!projectId) {
      throw new Error('RevenueCat projectId not configured');
    }
    if (!apiKey) {
      throw new Error('RevenueCat API key not configured');
    }

    const storePurchaseIdentifier = request.referenceId;
    if (!storePurchaseIdentifier) {
      return {
        ok: false,
        message: 'Missing store purchase identifier (referenceId)',
      };
    }

    const url = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/purchases?store_purchase_identifier=${encodeURIComponent(storePurchaseIdentifier)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          JSON.stringify({
            audit: 'revenuecat.funding.verify_failed',
            externalId: storePurchaseIdentifier,
            status: response.status,
            idempotencyKey: request.idempotencyKey,
          }),
        );
        return {
          ok: false,
          message: `RevenueCat API error: ${response.status}`,
        };
      }

      const data = (await response.json()) as RevenueCatPurchasesResponse;
      const items = data.items ?? [];

      if (items.length === 0) {
        return {
          ok: false,
          message: 'No purchase found for the given store identifier',
        };
      }

      if (items.length > 1) {
        return {
          ok: false,
          message: 'Multiple purchases found for the same store identifier',
        };
      }

      const purchase = items[0];

      if (purchase.status !== 'owned') {
        return {
          ok: false,
          message: `Purchase status is '${purchase.status ?? ''}', expected 'owned'`,
        };
      }

      if (
        !purchase.product_id ||
        !PRODUCT_ID_PATTERN.test(purchase.product_id)
      ) {
        return {
          ok: false,
          message: `Invalid product ID: ${purchase.product_id ?? ''}. Expected pattern: ^donation_\\d+$`,
        };
      }

      const currency = purchase.revenue_in_usd?.currency;
      if (
        !currency ||
        currency.toUpperCase() !== request.currency.toUpperCase()
      ) {
        return {
          ok: false,
          message: `Currency mismatch: purchase=${currency ?? ''}, requested=${request.currency}`,
        };
      }

      const gross = purchase.revenue_in_usd?.gross;
      if (typeof gross !== 'number' || Number.isNaN(gross)) {
        return {
          ok: false,
          message: 'Purchase gross amount is missing or invalid',
        };
      }

      const amountDiff = Math.abs(gross - request.amount);
      if (amountDiff > AMOUNT_TOLERANCE) {
        return {
          ok: false,
          message: `Amount mismatch: purchase=${gross}, requested=${request.amount} (diff=${amountDiff})`,
        };
      }

      const isSandbox = purchase.environment === 'sandbox';
      if (isSandbox && !allowSandbox) {
        return {
          ok: false,
          message: 'Sandbox purchase not allowed in production environment',
        };
      }

      this.logger.log(
        JSON.stringify({
          audit: 'revenuecat.funding.verified',
          provider: 'revenuecat',
          externalId: storePurchaseIdentifier,
          productId: purchase.product_id,
          environment: purchase.environment,
          amount: gross,
          currency,
          idempotencyKey: request.idempotencyKey,
        }),
      );

      return {
        ok: true,
        externalId: purchase.id ?? request.referenceId,
        message: 'RevenueCat purchase verified successfully',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(
          JSON.stringify({
            audit: 'revenuecat.funding.timeout',
            externalId: storePurchaseIdentifier,
            idempotencyKey: request.idempotencyKey,
          }),
        );
        return {
          ok: false,
          message: 'RevenueCat API request timeout',
        };
      }

      this.logger.error(
        JSON.stringify({
          audit: 'revenuecat.funding.error',
          externalId: storePurchaseIdentifier,
          error: error instanceof Error ? error.message : String(error),
          idempotencyKey: request.idempotencyKey,
        }),
      );
      return {
        ok: false,
        message: 'RevenueCat verification failed',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
