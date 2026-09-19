import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import type { Prisma } from '@prisma/client';

@Injectable()
export class DynamicPricingService {
  private readonly logger = new Logger(DynamicPricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate the effective price for a package given a fundraising percentage.
   * Rules are stored as JSON in PlatformSetting with key 'pricing.rules'.
   * Rule format: [{ condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 }, action: { type: 'discount', percent: 10 } }]
   * If no rules match or no rules configured, returns basePrice unchanged.
   */
  async calculatePrice(packageId: string, fundraisingPercentage: number): Promise<{ basePrice: number; effectivePrice: number; discountPercent: number }> {
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: { id: true, basePrice: true, isDynamicPricing: true },
    });

    if (!pkg) throw AppException.notFound('Package not found');
    if (!pkg.isDynamicPricing) {
      return { basePrice: Number(pkg.basePrice), effectivePrice: Number(pkg.basePrice), discountPercent: 0 };
    }

    // Get pricing rules from platform settings
    const pricingSetting = await this.prisma.platformSetting.findUnique({
      where: { key: 'pricing.rules' },
    });

    if (!pricingSetting || !pricingSetting.value) {
      // No rules configured, return base price
      return { basePrice: Number(pkg.basePrice), effectivePrice: Number(pkg.basePrice), discountPercent: 0 };
    }

    const value = pricingSetting.value as Prisma.JsonObject;
    if (!value.rules || !Array.isArray(value.rules)) {
      return { basePrice: Number(pkg.basePrice), effectivePrice: Number(pkg.basePrice), discountPercent: 0 };
    }

    const rules: Array<{ condition: { field: string; operator: string; value: number }; action: { type: string; percent: number } }> = value.rules as Array<{ condition: { field: string; operator: string; value: number }; action: { type: string; percent: number } }>;

    let totalDiscountPercent = 0;
    for (const rule of rules) {
      if (this.matchesCondition(fundraisingPercentage, rule.condition)) {
        if (rule.action.type === 'discount') {
          totalDiscountPercent += rule.action.percent;
        }
      }
    }

    // Cap discount at 50%
    totalDiscountPercent = Math.min(totalDiscountPercent, 50);

    const discountAmount = Number(pkg.basePrice) * (totalDiscountPercent / 100);
    const effectivePrice = Math.round((Number(pkg.basePrice) - discountAmount) * 100) / 100;

    return {
      basePrice: Number(pkg.basePrice),
      effectivePrice,
      discountPercent: totalDiscountPercent,
    };
  }

  private matchesCondition(value: number, condition: { field: string; operator: string; value: number }): boolean {
    if (condition.field !== 'fundraising_percentage') return false;
    switch (condition.operator) {
      case 'gte': return value >= condition.value;
      case 'lte': return value <= condition.value;
      case 'gt': return value > condition.value;
      case 'lt': return value < condition.value;
      case 'eq': return value === condition.value;
      default: return false;
    }
  }
}
