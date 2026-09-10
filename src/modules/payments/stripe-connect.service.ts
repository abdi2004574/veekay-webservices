import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AppConfig } from '../../config/configuration';

export interface ConnectAccountStatus {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  capabilities: Record<string, string>;
  requirementsDue: string[];
  currentlyDue: string[];
}

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly stripe: Stripe;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const secretKey = this.configService.get('stripe.secretKey', {
      infer: true,
    });
    this.stripe = new Stripe(secretKey);
  }

  async createConnectAccount(
    userId: string,
    type: 'express' | 'standard',
    country: string,
  ): Promise<{ accountId: string; onboardingUrl: string }> {
    const account = await this.stripe.accounts.create({
      type,
      country,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { userId },
    });

    const onboardingUrl = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${this.configService.get('appUrl', { infer: true })}/connect/refresh`,
      return_url: `${this.configService.get('appUrl', { infer: true })}/connect/return`,
      type: 'account_onboarding',
    });

    return { accountId: account.id, onboardingUrl: onboardingUrl.url };
  }

  async getAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
    const account = await this.stripe.accounts.retrieve(accountId);

    const capabilities: Record<string, string> = {};
    for (const [key, value] of Object.entries(account.capabilities ?? {})) {
      if (typeof value === 'object' && value !== null && 'status' in value) {
        capabilities[key] = value.status;
      }
    }

    const requirementsDue: string[] = [];
    const currentlyDue: string[] = [];
    if (account.requirements?.currently_due) {
      currentlyDue.push(...account.requirements.currently_due);
    }
    if ((account.requirements as any)?.due_set?.requirements_due) {
      requirementsDue.push(
        ...(account.requirements as any).due_set.requirements_due,
      );
    }

    return {
      stripeAccountId: account.id,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      capabilities,
      requirementsDue,
      currentlyDue,
    };
  }

  async createLoginLink(accountId: string): Promise<{ url: string }> {
    const loginLink = await this.stripe.accounts.createLoginLink(accountId);
    return { url: loginLink.url };
  }

  async updateAccount(
    accountId: string,
    params: {
      businessType?: string;
      email?: string;
      url?: string;
    },
  ): Promise<{ id: string }> {
    const account = await this.stripe.accounts.update(accountId, {
      business_type: params.businessType,
      email: params.email,
      business_profile: { url: params.url },
    });
    return { id: account.id };
  }

  async attachExternalAccount(
    accountId: string,
    bankToken: string,
  ): Promise<{ id: string; externalAccountId: string }> {
    const externalAccount = await this.stripe.accounts.createExternalAccount(
      accountId,
      { external_account: bankToken },
    );

    return {
      id: externalAccount.account as string,
      externalAccountId: externalAccount.id,
    };
  }

  getStripeInstance(): Stripe {
    return this.stripe;
  }
}
