import { Injectable } from '@nestjs/common';
import {
  FundingDepositRequest,
  FundingProviderResult,
  IFundingProvider,
} from '../interfaces/funding-provider.interface';

/**
 * RevenueCat funding provider.
 */
@Injectable()
export class RevenueCatFundingProvider implements IFundingProvider {
  readonly name = 'revenuecat';

  deposit(_request: FundingDepositRequest): Promise<FundingProviderResult> {
    return Promise.resolve({
      ok: true,
      externalId: `revenuecat-${Date.now()}`,
      message: 'RevenueCat funding provider - deposit verified via webhook',
    });
  }
}
