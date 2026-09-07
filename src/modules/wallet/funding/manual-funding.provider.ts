import { Injectable } from '@nestjs/common';
import {
  FundingDepositRequest,
  FundingProviderResult,
  IFundingProvider,
} from '../interfaces/funding-provider.interface';

/**
 * MVP-only stub. Real funding rails (JazzCash/Easypaisa/bank gateway/Stripe
 * Connect — TBD by client) plug in here implementing IFundingProvider. The
 * deposit() method on this stub always succeeds; it's used to let an admin
 * manually credit a wallet for testing/seed purposes only. NOT a public
 * payment flow — the admin endpoint that calls it is gated behind
 * super_admin + 2FA.
 */
@Injectable()
export class ManualFundingProvider implements IFundingProvider {
  readonly name = 'manual';

  async deposit(_request: FundingDepositRequest): Promise<FundingProviderResult> {
    return {
      ok: true,
      externalId: `manual-${Date.now()}`,
      message: 'Manual credit by admin',
    };
  }
}
