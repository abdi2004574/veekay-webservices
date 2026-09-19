import {
  getDonationAmountFromProductId,
  isDonationEvent,
  isDonationProduct,
} from './revenuecat-webhook.dto';

describe('RevenueCat donation helpers', () => {
  describe('getDonationAmountFromProductId', () => {
    it('returns 5 for donation_5', () => {
      expect(getDonationAmountFromProductId('donation_5')).toBe(5);
    });

    it('returns 100 for donation_100', () => {
      expect(getDonationAmountFromProductId('donation_100')).toBe(100);
    });

    it('returns 0 for an invalid product id', () => {
      expect(getDonationAmountFromProductId('invalid')).toBe(0);
    });
  });

  describe('isDonationEvent', () => {
    it('returns true for NON_SUBSCRIPTION_PURCHASE', () => {
      expect(isDonationEvent('NON_SUBSCRIPTION_PURCHASE')).toBe(true);
    });

    it('returns false for INITIAL_PURCHASE', () => {
      expect(isDonationEvent('INITIAL_PURCHASE')).toBe(false);
    });
  });

  describe('isDonationProduct', () => {
    it('returns true for donation_10', () => {
      expect(isDonationProduct('donation_10')).toBe(true);
    });

    it('returns false for ent_basic', () => {
      expect(isDonationProduct('ent_basic')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isDonationProduct(undefined)).toBe(false);
    });
  });
});
