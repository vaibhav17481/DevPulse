import { DatabaseService } from '../database/database.service';
import { SESSION_TTL_MS } from './session.constants';
import { SessionService } from './session.service';
import {
  generateSessionToken,
  hashSessionToken,
} from './session-token';

interface SessionCreateArguments {
  data: { userId: string; tokenHash: string; expiresAt: Date };
  select: { id: true };
}

interface SessionFindUniqueArguments {
  where: {
    tokenHash: string;
    revokedAt: null;
    expiresAt: { gt: Date };
  };
  select: {
    user: { select: { id: true; email: true } };
  };
}

interface FoundSession {
  user: { id: string; email: string | null } | null;
}

interface SessionUpdateManyArguments {
  where: { tokenHash: string; revokedAt: null };
  data: { revokedAt: Date };
}

describe('SessionService', () => {
  let create: jest.MockedFunction<
    (arguments_: SessionCreateArguments) => Promise<{ id: string }>
  >;
  let findUnique: jest.MockedFunction<
    (arguments_: SessionFindUniqueArguments) => Promise<FoundSession | null>
  >;
  let updateMany: jest.MockedFunction<
    (arguments_: SessionUpdateManyArguments) => Promise<{ count: number }>
  >;
  let service: SessionService;

  const now = new Date('2026-11-02T12:00:00.000Z');
  const user = { id: 'user-1', email: 'user@example.com' };

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({ id: 'session-1' });
    findUnique = jest.fn();
    updateMany = jest.fn().mockResolvedValue({ count: 1 });

    const database = {
      client: { session: { create, findUnique, updateMany } },
    } as unknown as DatabaseService;

    service = new SessionService(database);
  });

  describe('create', () => {
    it('creates a 7-day session and stores only the token hash', async () => {
      const session = await service.create('user-1', now);

      const createArguments = create.mock.calls[0]?.[0];
      const expectedExpiresAt = new Date(
        now.getTime() + SESSION_TTL_MS,
      );

      expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(session.expiresAt).toEqual(expectedExpiresAt);
      expect(createArguments?.data.userId).toBe('user-1');
      expect(createArguments?.data.expiresAt).toEqual(expectedExpiresAt);
      expect(createArguments?.data.tokenHash).toBe(
        hashSessionToken(session.token),
      );
      expect(createArguments?.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createArguments?.data).not.toHaveProperty('token');
      expect(createArguments?.data.tokenHash).not.toBe(session.token);
      expect(createArguments?.select).toEqual({ id: true });
    });

    it('generates distinct high-entropy tokens', async () => {
      const tokens = new Set<string>();

      for (let index = 0; index < 8; index += 1) {
        const session = await service.create('user-1', now);
        tokens.add(session.token);
      }

      expect(tokens.size).toBe(8);
    });

    it('propagates unexpected persistence failures', async () => {
      create.mockRejectedValue(new Error('database unavailable'));

      await expect(service.create('user-1', now)).rejects.toThrow(
        'database unavailable',
      );
    });
  });

  describe('validate', () => {
    it('returns the safe user for a valid session', async () => {
      const token = generateSessionToken();
      findUnique.mockResolvedValue({ user });

      await expect(service.validate(token, now)).resolves.toEqual(user);

      expect(findUnique).toHaveBeenCalledWith({
        where: {
          tokenHash: hashSessionToken(token),
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: {
          user: { select: { id: true, email: true } },
        },
      });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('rejects missing or malformed tokens without a database query', async () => {
      await expect(service.validate('', now)).resolves.toBeNull();
      await expect(service.validate('not-a-token', now)).resolves.toBeNull();
      await expect(
        service.validate(`${generateSessionToken()}x`, now),
      ).resolves.toBeNull();

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('returns null when no active session matches', async () => {
      const token = generateSessionToken();
      findUnique.mockResolvedValue(null);

      await expect(service.validate(token, now)).resolves.toBeNull();
    });

    it('returns null when the associated user is missing', async () => {
      findUnique.mockResolvedValue({ user: null });

      await expect(
        service.validate(generateSessionToken(), now),
      ).resolves.toBeNull();
    });

    it('propagates unexpected database failures', async () => {
      findUnique.mockRejectedValue(new Error('database unavailable'));

      await expect(
        service.validate(generateSessionToken(), now),
      ).rejects.toThrow('database unavailable');
    });
  });

  describe('revoke', () => {
    it('revokes only the session matching the token hash', async () => {
      const token = generateSessionToken();

      await service.revoke(token, now);

      expect(updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: hashSessionToken(token),
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      expect(
        JSON.stringify(updateMany.mock.calls[0]?.[0]),
      ).not.toContain(token);
    });

    it('ignores missing or malformed tokens', async () => {
      await service.revoke('', now);
      await service.revoke('not-a-token', now);

      expect(updateMany).not.toHaveBeenCalled();
    });

    it('does not fail when the session is already revoked', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revoke(generateSessionToken(), now),
      ).resolves.toBeUndefined();
    });

    it('propagates unexpected database failures', async () => {
      updateMany.mockRejectedValue(new Error('database unavailable'));

      await expect(
        service.revoke(generateSessionToken(), now),
      ).rejects.toThrow('database unavailable');
    });
  });
});
