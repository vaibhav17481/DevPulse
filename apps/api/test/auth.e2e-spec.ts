import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { DatabaseService } from './../src/database/database.service';

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
}

interface FindUniqueArguments {
  where: { email: string };
}

interface CreateArguments {
  data: { email: string; passwordHash: string };
}

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let users: StoredUser[];

  beforeEach(async () => {
    users = [];

    const findUnique = (arguments_: FindUniqueArguments) => {
      const user = users.find(
        (candidate) => candidate.email === arguments_.where.email,
      );

      return Promise.resolve(user ? { id: user.id } : null);
    };

    const create = (arguments_: CreateArguments) => {
      if (
        users.some(
          (candidate) => candidate.email === arguments_.data.email,
        )
      ) {
        const error = Object.assign(
          new Error('Unique constraint failed'),
          { code: 'P2002' },
        );

        return Promise.reject(error);
      }

      const user: StoredUser = {
        id: `user-${users.length + 1}`,
        email: arguments_.data.email,
        passwordHash: arguments_.data.passwordHash,
      };

      users.push(user);

      return Promise.resolve({ id: user.id, email: user.email });
    };

    const database = {
      client: { user: { findUnique, create } },
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

  it('creates a user with a normalized email and hashed password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: '  New.User@Example.COM ',
        password: 'ValidPass123',
      })
      .expect(201);

    const body = response.body as { id: string; email: string };

    expect(body).toEqual({
      id: 'user-1',
      email: 'new.user@example.com',
    });
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('passwordHash');
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('new.user@example.com');
    expect(users[0]?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(users[0]?.passwordHash).not.toBe('ValidPass123');
  });

  it('returns 409 for a duplicate email after normalization', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'ValidPass123',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: '  DUPLICATE@Example.com ',
        password: 'ValidPass123',
      })
      .expect(409);

    expect(users).toHaveLength(1);
  });

  it('returns 400 for an invalid email', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'not-an-email',
        password: 'ValidPass123',
      })
      .expect(400);

    const body = response.body as { statusCode: number; error: string };

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
  });

  it('returns 400 for a password below the minimum policy', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'short-password@example.com',
        password: 'ShortPass12',
      })
      .expect(400);

    expect(users).toHaveLength(0);
  });

  it('rejects unknown request fields', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'unknown-field@example.com',
        password: 'ValidPass123',
        name: 'Injected Name',
      })
      .expect(400);

    expect(users).toHaveLength(0);
  });
});
