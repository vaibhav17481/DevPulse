import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes passwords with Argon2id and verifies them', async () => {
    const password = 'ValidPass123';
    const passwordHash = await service.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toContain(password);
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(
      service.verify(passwordHash, 'WrongPass123'),
    ).resolves.toBe(false);
  });
});
