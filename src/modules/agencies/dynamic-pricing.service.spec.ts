import { DynamicPricingService } from './dynamic-pricing.service';
import { AppException } from '../../common/errors/app.exception';

describe('DynamicPricingService', () => {
  let prisma: any;
  let service: DynamicPricingService;

  beforeEach(() => {
    prisma = {
      package: { findUnique: jest.fn() },
      platformSetting: { findUnique: jest.fn() },
    };
    service = new DynamicPricingService(prisma);
  });

  describe('calculatePrice', () => {
    it('returns basePrice unchanged when isDynamicPricing is false', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: false,
      });

      const result = await service.calculatePrice('pkg-1', 75);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 1000,
        discountPercent: 0,
      });
    });

    it('returns basePrice unchanged when no rules configured', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue(null);

      const result = await service.calculatePrice('pkg-1', 75);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 1000,
        discountPercent: 0,
      });
    });

    it('returns basePrice unchanged when rules array is missing', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: { otherKey: 'value' },
      });

      const result = await service.calculatePrice('pkg-1', 75);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 1000,
        discountPercent: 0,
      });
    });

    it('applies discount when rule matches (fundraising >= 50% -> 10% discount)', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 },
              action: { type: 'discount', percent: 10 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 75);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 900,
        discountPercent: 10,
      });
    });

    it('does not apply discount when rule does not match', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 },
              action: { type: 'discount', percent: 10 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 40);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 1000,
        discountPercent: 0,
      });
    });

    it('caps discount at 50%', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 },
              action: { type: 'discount', percent: 60 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 75);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 500,
        discountPercent: 50,
      });
    });

    it('returns notFound when package does not exist', async () => {
      prisma.package.findUnique.mockResolvedValue(null);

      await expect(service.calculatePrice('missing-pkg', 75)).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      await expect(service.calculatePrice('missing-pkg', 75)).rejects.toThrow(AppException);
    });

    it('multiple matching rules accumulate discounts', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 25 },
              action: { type: 'discount', percent: 10 },
            },
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 },
              action: { type: 'discount', percent: 15 },
            },
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 75 },
              action: { type: 'discount', percent: 20 },
            },
          ],
        },
      });

      // At 80%, all three rules match: 10 + 15 + 20 = 45%
      const result = await service.calculatePrice('pkg-1', 80);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 550,
        discountPercent: 45,
      });
    });

    it('multiple matching rules cap at 50%', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 25 },
              action: { type: 'discount', percent: 20 },
            },
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 },
              action: { type: 'discount', percent: 20 },
            },
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 75 },
              action: { type: 'discount', percent: 20 },
            },
          ],
        },
      });

      // At 80%, all three rules match: 20 + 20 + 20 = 60%, capped at 50%
      const result = await service.calculatePrice('pkg-1', 80);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 500,
        discountPercent: 50,
      });
    });

    it('supports lte operator', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'lte', value: 30 },
              action: { type: 'discount', percent: 5 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 25);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 950,
        discountPercent: 5,
      });
    });

    it('supports gt operator', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gt', value: 50 },
              action: { type: 'discount', percent: 10 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 51);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 900,
        discountPercent: 10,
      });
    });

    it('supports lt operator', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'lt', value: 50 },
              action: { type: 'discount', percent: 10 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 49);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 900,
        discountPercent: 10,
      });
    });

    it('supports eq operator', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'eq', value: 100 },
              action: { type: 'discount', percent: 25 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 100);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 750,
        discountPercent: 25,
      });
    });

    it('ignores rules with unknown field', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'unknown_field', operator: 'gte', value: 50 },
              action: { type: 'discount', percent: 10 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 75);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 1000,
        discountPercent: 0,
      });
    });

    it('ignores rules with unknown action type', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 1000,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 },
              action: { type: 'unknown_action', percent: 10 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 75);

      expect(result).toEqual({
        basePrice: 1000,
        effectivePrice: 1000,
        discountPercent: 0,
      });
    });

    it('rounds effectivePrice to 2 decimal places', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'pkg-1',
        basePrice: 999.99,
        isDynamicPricing: true,
      });
      prisma.platformSetting.findUnique.mockResolvedValue({
        value: {
          rules: [
            {
              condition: { field: 'fundraising_percentage', operator: 'gte', value: 50 },
              action: { type: 'discount', percent: 10 },
            },
          ],
        },
      });

      const result = await service.calculatePrice('pkg-1', 75);

      // 999.99 * 0.9 = 899.991 -> rounded to 899.99
      expect(result.effectivePrice).toBe(899.99);
      expect(result.discountPercent).toBe(10);
    });
  });
});
