import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

export interface SubscriberAttribute {
  value: string;
  updated_at: number;
  is_changelog?: boolean;
  name?: string;
}

@Injectable()
export class RevenueCatApiService {
  private readonly logger = new Logger(RevenueCatApiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.revenuecat.com/v1';

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.apiKey = this.configService.get('revenuecat.apiKey', { infer: true }) ?? '';
  }

  private async request(path: string): Promise<any> {
    if (!this.apiKey) {
      throw new BadRequestException('RevenueCat API key not configured');
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      throw new BadRequestException(`RevenueCat API error: ${res.status}`);
    }
    return res.json();
  }

  async getSubscriberAttributes(appUserId: string): Promise<Record<string, SubscriberAttribute>> {
    const data = await this.request(`/subscribers/${encodeURIComponent(appUserId)}?alt=verbose`);
    return data.subscriber_attributes ?? {};
  }

  async getSubscriber(subscriberId: string): Promise<any> {
    return this.request(`/subscribers/${encodeURIComponent(subscriberId)}`);
  }

  async getTransaction(transactionId: string): Promise<any> {
    return this.request(`/transactions/${encodeURIComponent(transactionId)}`);
  }
}
