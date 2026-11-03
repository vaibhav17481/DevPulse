import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AUTHENTICATION_REQUIRED_MESSAGE } from './../src/auth/session-auth.guard';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from './../src/auth/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from './../src/auth/session-token';
import { DatabaseService } from './../src/database/database.service';

interface StoredUser {
  id: string;
  email: string;
}

interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
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
  user: StoredUser | null;
}

interface SessionUpdateManyArguments {
  where: { tokenHash: string; revokedAt: null };
  data: { revokedAt: Date };
}

interface ErrorResponseBody {
  message: string;
}

type Headers = Record<string, string | string[] | undefined>;

function getSetCookie(headers: Headers): string {
  const header = headers['set-cookie'];

  if (!header) {
    throw new Error('Expected a Set-Cookie header.');
  }

  const value = Array.isArray(header) ? header[0] : header;

  if (!value) {
    throw new Error('Expected a Set-Cookie header.');
  }

  return value;
}

describe('AuthController session endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let sessions: StoredSession[];
  let findUnique: jest.MockedFunction<
    (arguments_: SessionFindUniqueArguments) => Promise<FoundSession | null>
  >;
  let updateMany: jest.MockedFunction<
    (arguments_: SessionUpdateManyArguments) => Promise<{ count: number }>
  >;

  beforeEach(async () => {
    users = new Map();
    sessions = [];
    findUnique = jest.fn((arguments_) => {
      const session = sessions.find(
        (candidate) =>
          candidate.tokenHash === arguments_.where.tokenHash,
      );

      if (
        !session ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <=
          arguments_.where.expiresAt.gt.getTime()
      ) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        user: users.get(session.userId) ?? null,
      });
    });
    updateMany = jest.fn((arguments_) => {
      let count = 0;

      for (const session of sessions) {
        if (
          session.tokenHash === arguments_.where.tokenHash &&
          session.revokedAt === null
        ) {
          session.revokedAt = arguments_.data.revokedAt;
          count += 1;
        }
      }

      return Promise.resolve({ count });
    });

    const database = {
      client: {
        session: { findUnique, updateMany },
      },
      onModuleDestroy: (): Promise<void> => Promise.resolve(),
    } as unknown as DatabaseService;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function addUser(
    id = 'user-1',
    email = 'user@example.com',
  ): StoredUser {
    const user = { id, email };
    users.set(id, user);

    return user;
  }

  function addSession(
    userId: string,
    token: string,
    options: { expiresAt?: Date; revokedAt?: Date | null } = {},
  ): StoredSession {
    const session: StoredSession = {
      id: `session-${sessions.length + 1}`,
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt:
        options.expiresAt ?? new Date(Date.now() + SESSION_TTL_MS),
      revokedAt: options.revokedAt ?? null,
    };

    sessions.push(session);

    return session;
  }

  function getMe(token?: string): request.Test {
    const test = request(app.getHttpServer()).get('/auth/me');

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function logout(token?: string): request.Test {
    const test = request(app.getHttpServer()).post('/auth/logout');

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  it('rejects GET /auth/me without a session cookie', async () => {
    const response = await getMe().expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a malformed session token without a database query', async () => {
    const response = await getMe('not-a-token').expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns only the safe user for a valid session', async () => {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token);

    const response = await getMe(token).expect(200);
    const body = response.body as Record<string, unknown>;

    expect(body).toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('sessions');
    expect(body).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it('rejects a token with no matching session', async () => {
    const token = generateSessionToken();

    await getMe(token).expect(401);

    const findArguments = findUnique.mock.calls[0]?.[0];

    expect(findArguments?.where.tokenHash).toBe(
      hashSessionToken(token),
    );
    expect(findArguments?.where.revokedAt).toBeNull();
    expect(findArguments?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(findArguments?.select).toEqual({
      user: { select: { id: true, email: true } },
    });
  });

  it('rejects an expired session', async () => {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await getMe(token).expect(401);
  });

  it('rejects a revoked session', async () => {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token, { revokedAt: new Date() });

    await getMe(token).expect(401);
  });

  it('rejects a session whose associated user is missing', async () => {
    const token = generateSessionToken();
    addSession('missing-user', token);

    await getMe(token).expect(401);
  });

  it('revokes the current session, clears the cookie, and rejects it', async () => {
    const token = generateSessionToken();
    addUser();
    const session = addSession('user-1', token);

    const response = await logout(token).expect(204);
    const setCookie = getSetCookie(response.headers);

    expect(response.text).toBe('');
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const expires = /Expires=([^;]+)/.exec(setCookie)?.[1];
    expect(new Date(expires ?? '').getTime()).toBeLessThan(Date.now());
    expect(setCookie).not.toContain(token);

    const revokeArguments = updateMany.mock.calls[0]?.[0];

    expect(revokeArguments?.where.tokenHash).toBe(
      hashSessionToken(token),
    );
    expect(revokeArguments?.where.revokedAt).toBeNull();
    expect(revokeArguments?.data.revokedAt).toBeInstanceOf(Date);
    expect(session.revokedAt).toBeInstanceOf(Date);

    await getMe(token).expect(401);
  });

  it('treats repeated logout as idempotent', async () => {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token);

    await logout(token).expect(204);
    await logout(token).expect(204);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(sessions[0]?.revokedAt).toBeInstanceOf(Date);
  });

  it('returns 204 and clears the cookie when no session is supplied', async () => {
    const response = await logout().expect(204);

    expect(response.text).toBe('');
    expect(getSetCookie(response.headers)).toContain(
      `${SESSION_COOKIE_NAME}=;`,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns 204 and clears the cookie for a malformed token', async () => {
    const response = await logout('not-a-token').expect(204);

    expect(getSetCookie(response.headers)).toContain(
      `${SESSION_COOKIE_NAME}=;`,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not revoke another session for the same user', async () => {
    const firstToken = generateSessionToken();
    const secondToken = generateSessionToken();
    addUser();
    const firstSession = addSession('user-1', firstToken);
    const secondSession = addSession('user-1', secondToken);

    await logout(firstToken).expect(204);

    expect(firstSession.revokedAt).toBeInstanceOf(Date);
    expect(secondSession.revokedAt).toBeNull();
    await getMe(firstToken).expect(401);
    await getMe(secondToken).expect(200);
  });
});
