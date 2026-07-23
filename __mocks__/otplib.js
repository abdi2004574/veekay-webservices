// Manual mock: otplib's real implementation pulls in ESM-only @noble/@scure
// dependencies that Jest's CommonJS transform can't parse. Tests that need
// real TOTP behavior should test TwoFactorService's logic against this
// deterministic stand-in rather than exercising the real crypto libraries.
module.exports = {
  generateSecret: jest.fn(() => 'MOCKSECRETMOCKSECRET'),
  generateURI: jest.fn(
    ({ issuer, label, secret }) =>
      `otpauth://totp/${issuer}:${label}?secret=${secret}`,
  ),
  verify: jest.fn(() => Promise.resolve({ valid: true, delta: 0 })),
};
