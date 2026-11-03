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
import {
  WORKSPACE_CREATION_FAILED_MESSAGE,
  WORKSPACE_DESCRIPTION_MAX_LENGTH,
  WORKSPACE_NAME_MAX_LENGTH,
  WORKSPACE_OWNER_ROLE,
} from './../src/workspaces/workspace.constants';
import type { WorkspaceRoleName } from './../src/workspaces/workspace.types';

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

interface StoredWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
}

interface StoredMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRoleName;
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

interface WorkspaceCreateArguments {
  data: {
    name: string;
    slug: string;
    description: string | null;
  };
  select: {
    id: true;
    name: true;
    slug: true;
    description: true;
    createdAt: true;
  };
}

interface MembershipCreateArguments {
  data: {
    workspaceId: string;
    userId: string;
    role: 'OWNER';
  };
  select: {
    role: true;
  };
}

interface CreatedMembership {
  role: WorkspaceRoleName;
}

interface TransactionClient {
  workspace: {
    create: (
      arguments_: WorkspaceCreateArguments,
    ) => Promise<StoredWorkspace>;
  };
  workspaceMember: {
    create: (
      arguments_: MembershipCreateArguments,
    ) => Promise<CreatedMembership>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

interface WorkspaceResponseBody {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: WorkspaceRoleName;
  createdAt: string;
}

interface ErrorResponseBody {
  message: string;
}

describe('WorkspacesController (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let sessions: StoredSession[];
  let workspaces: StoredWorkspace[];
  let memberships: StoredMembership[];
  let membershipFailure: boolean;
  let findUnique: jest.MockedFunction<
    (arguments_: SessionFindUniqueArguments) => Promise<FoundSession | null>
  >;
  let transaction: jest.MockedFunction<
    (callback: TransactionCallback) => Promise<unknown>
  >;

  beforeEach(async () => {
    users = new Map();
    sessions = [];
    workspaces = [];
    memberships = [];
    membershipFailure = false;

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
    transaction = jest.fn(async (callback) => {
      let sequence = workspaces.length + memberships.length;
      const pendingWorkspaces: StoredWorkspace[] = [];
      const pendingMemberships: StoredMembership[] = [];
      const transactionClient: TransactionClient = {
        workspace: {
          create: (arguments_) => {
            sequence += 1;

            const workspace: StoredWorkspace = {
              id: `workspace-${sequence}`,
              name: arguments_.data.name,
              slug: arguments_.data.slug,
              description: arguments_.data.description,
              createdAt: new Date('2026-11-02T12:00:00.000Z'),
            };

            pendingWorkspaces.push(workspace);

            return Promise.resolve(workspace);
          },
        },
        workspaceMember: {
          create: (arguments_) => {
            if (membershipFailure) {
              return Promise.reject(
                new Error('foreign key constraint failed'),
              );
            }

            sequence += 1;

            const membership: StoredMembership = {
              id: `membership-${sequence}`,
              workspaceId: arguments_.data.workspaceId,
              userId: arguments_.data.userId,
              role: arguments_.data.role,
            };

            pendingMemberships.push(membership);

            return Promise.resolve({ role: arguments_.data.role });
          },
        },
      };

      const result = await callback(transactionClient);

      workspaces.push(...pendingWorkspaces);
      memberships.push(...pendingMemberships);

      return result;
    });

    const database = {
      client: {
        session: { findUnique },
        $transaction: transaction,
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

  function addSession(userId: string, token: string): StoredSession {
    const session: StoredSession = {
      id: `session-${sessions.length + 1}`,
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      revokedAt: null,
    };

    sessions.push(session);

    return session;
  }

  function createWorkspace(
    token: string | undefined,
    body: Record<string, unknown>,
  ): request.Test {
    const test = request(app.getHttpServer())
      .post('/workspaces')
      .send(body);

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function createAuthenticatedWorkspace(
    body: Record<string, unknown> = { name: 'My Workspace' },
  ): { token: string; test: request.Test } {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token);

    return { token, test: createWorkspace(token, body) };
  }

  it('rejects workspace creation without a session cookie', async () => {
    const response = await createWorkspace(undefined, {
      name: 'My Workspace',
    }).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates the workspace and an owner membership for the current user', async () => {
    const { test } = createAuthenticatedWorkspace({
      name: '  My Workspace  ',
      description: '  A workspace description  ',
    });

    const response = await test.expect(201);
    const body = response.body as WorkspaceResponseBody;

    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'role',
      'slug',
    ]);
    expect(body.name).toBe('My Workspace');
    expect(body.slug).toMatch(/^my-workspace-[a-f0-9]{8}$/);
    expect(body.description).toBe('A workspace description');
    expect(body.role).toBe(WORKSPACE_OWNER_ROLE);
    expect(body.createdAt).toBe('2026-11-02T12:00:00.000Z');
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('members');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(workspaces).toEqual([
      {
        id: body.id,
        name: 'My Workspace',
        slug: body.slug,
        description: 'A workspace description',
        createdAt: new Date(body.createdAt),
      },
    ]);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.id).toMatch(/^membership-\d+$/);
    expect(memberships[0]).toMatchObject({
      workspaceId: body.id,
      userId: 'user-1',
      role: WORKSPACE_OWNER_ROLE,
    });
  });

  it('stores an omitted description as null', async () => {
    const { test } = createAuthenticatedWorkspace();

    const response = await test.expect(201);
    const body = response.body as WorkspaceResponseBody;

    expect(body.description).toBeNull();
    expect(workspaces[0]?.description).toBeNull();
  });

  it('accepts an explicit null description', async () => {
    const { test } = createAuthenticatedWorkspace({
      name: 'My Workspace',
      description: null,
    });

    const response = await test.expect(201);

    expect(
      (response.body as WorkspaceResponseBody).description,
    ).toBeNull();
  });

  it('rejects a missing workspace name', async () => {
    const { test } = createAuthenticatedWorkspace({
      description: 'No name',
    });

    await test.expect(400);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only workspace name', async () => {
    const { test } = createAuthenticatedWorkspace({ name: '   ' });

    await test.expect(400);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-string workspace name', async () => {
    const { test } = createAuthenticatedWorkspace({ name: 123 });

    await test.expect(400);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects names longer than the database limit', async () => {
    const { test } = createAuthenticatedWorkspace({
      name: 'a'.repeat(WORKSPACE_NAME_MAX_LENGTH + 1),
    });

    await test.expect(400);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects descriptions over the API limit', async () => {
    const { test } = createAuthenticatedWorkspace({
      name: 'My Workspace',
      description: 'a'.repeat(WORKSPACE_DESCRIPTION_MAX_LENGTH + 1),
    });

    await test.expect(400);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects client-supplied ownership fields', async () => {
    const { test } = createAuthenticatedWorkspace({
      name: 'My Workspace',
      userId: 'another-user',
      role: 'OWNER',
    });

    await test.expect(400);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rolls back workspace creation when owner membership creation fails', async () => {
    membershipFailure = true;
    const { test } = createAuthenticatedWorkspace();

    const response = await test.expect(500);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_CREATION_FAILED_MESSAGE,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(workspaces).toEqual([]);
    expect(memberships).toEqual([]);
  });
});
