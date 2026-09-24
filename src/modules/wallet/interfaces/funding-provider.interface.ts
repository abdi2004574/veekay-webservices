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
 * Processor-agnostic funding-rail interface. Concrete providers implement
 * this interface and are injected via the FUNDING_PROVIDER token. The wallet
 * ledger never calls a payment processor directly — the provider returns a
 * verification result, and WalletService decides whether to credit.
 *
 * Current implementations:
 * - ManualFundingProvider: admin-only stub that always succeeds (ops
 *   reconciliation / testing only, gated behind super_admin + 2FA).
 * - RevenueCatFundingProvider: verifies RevenueCat in-app purchase donations
 *   via the RevenueCat REST API (projects endpoint).
 *
 * Note: Stripe Connect is used separately for agency/traveler payouts and
 * commission splitting — not for wallet-funding deposits. See
 * docs/features/wallet-ledger.md.
 */
export interface IFundingProvider {
  readonly name: string;
  deposit(request: FundingDepositRequest): Promise<FundingProviderResult>;
}
