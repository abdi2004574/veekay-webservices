import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password to a bcrypt-shaped value distinct from the plain text', async () => {
    const hash = await service.hash('StrongPassword123!');
    expect(hash).not.toEqual('StrongPassword123!');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await service.hash('StrongPassword123!');
    await expect(service.verify('StrongPassword123!', hash)).resolves.toBe(
      true,
    );
  });

  it('rejects an incorrect password against a hash', async () => {
    const hash = await service.hash('StrongPassword123!');
    await expect(service.verify('WrongPassword!', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same input (random salt)', async () => {
    const [a, b] = await Promise.all([
      service.hash('StrongPassword123!'),
      service.hash('StrongPassword123!'),
    ]);
    expect(a).not.toEqual(b);
  });
});
