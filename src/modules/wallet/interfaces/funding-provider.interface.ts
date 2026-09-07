export const FUNDING_PROVIDER = Symbol('FUNDING_PROVIDER');

export interface FundingDepositRequest {
  walletAccountId: string;
  amount: number;
  currency: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  description?: string;
}

export interface FundingProviderResult {
  ok: boolean;
  externalId?: string;
  message?: string;
}

/**
 * Processor-agnostic funding-rail interface. The eventual client-confirmed
 * processor (JazzCash / Easypaisa / bank gateway / Stripe Connect — TBD) plugs
 * in here implementing IFundingProvider. Until that decision is made, the
 * ManualFundingProvider stub is the only registered implementation; admin
 * can use it to credit a wallet for MVP/testing only — see
 * docs/features/wallet-ledger.md.
 */
export interface IFundingProvider {
  readonly name: string;
  deposit(request: FundingDepositRequest): Promise<FundingProviderResult>;
}
