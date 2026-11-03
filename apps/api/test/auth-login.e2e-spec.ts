import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PasswordService } from './../src/auth/password.service';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from './../src/auth/session.constants';
import { hashSessionToken } from './../src/auth/session-token';
import { DatabaseService } from './../src/database/database.service';

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string | null;
}

interface FindUniqueArguments {
  where: { email: string };
  select: { id?: true; email?: true; passwordHash?: true };
}

interface SessionCreateArguments {
  data: { userId: string; tokenHash: string; expiresAt: Date };
  select: { id: true };
}

type Headers = Record<string, string | string[] | undefined>;

interface ErrorResponseBody {
  message: string;
}

function findSetCookie(headers: Headers): string | undefined {
  const header = headers['set-cookie'];

  if (!header) {
    return undefined;
  }

  return Array.isArray(header) ? header[0] : header;
}

function getSetCookie(headers: Headers): string {
  const header = findSetCookie(headers);

  if (!header) {
    throw new Error('Expected a Set-Cookie header.');
  }

  return header;
}

function getCookieValue(setCookie: string): string {
  const pair = setCookie.split(';')[0] ?? '';
  const separator = pair.indexOf('=');

  return pair.slice(separator + 1);
}

describe('AuthController login (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let findUnique: jest.MockedFunction<
    (arguments_: FindUniqueArguments) => Promise<StoredUser | null>
  >;
  let createSession: jest.MockedFunction<
    (arguments_: SessionCreateArguments) => Promise<{ id: string }>
  >;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await new PasswordService().hash('ValidPass123');
  });

  beforeEach(async () => {
    users = new Map();
    findUnique = jest.fn((arguments_) => {
      return Promise.resolve(users.get(arguments_.where.email) ?? null);
    });
    createSession = jest.fn().mockResolvedValue({ id: 'session-1' });

    const database = {
      client: {
        user: { findUnique },
        session: { create: createSession },
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
    email = 'user@example.com',
    hash: string | null = passwordHash,
  ): StoredUser {
    const user: StoredUser = { id: 'user-1', email, passwordHash: hash };
    users.set(email, user);

    return user;
  }

  function login(email: string, password: string): request.Test {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
  }

  it('logs in, sets a secure cookie, and persists only the token hash', async () => {
    addUser();

    const response = await login(
      '  User@Example.COM ',
      'ValidPass123',
    ).expect(200);

    expect(response.body).toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
    expect(response.body).not.toHaveProperty('sessionToken');
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');

    const setCookie = getSetCookie(response.headers);
    const rawToken = getCookieValue(setCookie);

    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(response.body)).not.toContain(rawToken);

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: { id: true, email: true, passwordHash: true },
    });

    const sessionArguments = createSession.mock.calls[0]?.[0];
    expect(sessionArguments?.data.userId).toBe('user-1');
    expect(sessionArguments?.data.tokenHash).toBe(
      hashSessionToken(rawToken),
    );
    expect(sessionArguments?.data.tokenHash).not.toBe(rawToken);
    expect(sessionArguments?.data).not.toHaveProperty('token');

    const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1]);
    expect(maxAge).toBeLessThanOrEqual(SESSION_TTL_MS / 1000);
    expect(maxAge).toBeGreaterThan(SESSION_TTL_MS / 1000 - 10);

    const expiresMatch = /Expires=([^;]+)/.exec(setCookie);
    expect(expiresMatch).not.toBeNull();
    const cookieExpiry = new Date(expiresMatch?.[1] ?? '').getTime();
    const databaseExpiry = sessionArguments?.data.expiresAt.getTime() ?? 0;

    expect(Math.abs(cookieExpiry - databaseExpiry)).toBeLessThan(1000);
  });

  it('sets Secure when running in production', async () => {
    addUser();
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const response = await login(
        'user@example.com',
        'ValidPass123',
      ).expect(200);

      expect(getSetCookie(response.headers)).toContain('Secure');
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it('returns the same generic 401 for an incorrect password', async () => {
    addUser();

    const response = await login(
      'user@example.com',
      'WrongPass123',
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      'Invalid email or password.',
    );
    expect(findSetCookie(response.headers)).toBeUndefined();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns the same generic 401 for an unknown email', async () => {
    const response = await login(
      'unknown@example.com',
      'ValidPass123',
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      'Invalid email or password.',
    );
    expect(findSetCookie(response.headers)).toBeUndefined();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('fails safely for an account without a password hash', async () => {
    addUser('user@example.com', null);

    const response = await login(
      'user@example.com',
      'ValidPass123',
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      'Invalid email or password.',
    );
    expect(findSetCookie(response.headers)).toBeUndefined();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid input', async () => {
    await login('not-an-email', 'ValidPass123').expect(400);
    await login('user@example.com', '').expect(400);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'user@example.com',
        password: 'ValidPass123',
        unexpected: true,
      })
      .expect(400);

    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns a generic 500 without leaking database details', async () => {
    findUnique.mockRejectedValue(new Error('database unavailable'));

    const response = await login(
      'user@example.com',
      'ValidPass123',
    ).expect(500);

    expect((response.body as ErrorResponseBody).message).toBe(
      'Unable to log in.',
    );
    expect(JSON.stringify(response.body)).not.toContain(
      'database unavailable',
    );
    expect(findSetCookie(response.headers)).toBeUndefined();
    expect(createSession).not.toHaveBeenCalled();
  });
});
