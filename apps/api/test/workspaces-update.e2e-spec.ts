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
  WORKSPACE_DESCRIPTION_MAX_LENGTH,
  WORKSPACE_NAME_MAX_LENGTH,
  WORKSPACE_NOT_FOUND_MESSAGE,
  WORKSPACE_UPDATE_EMPTY_MESSAGE,
  WORKSPACE_UPDATE_FORBIDDEN_MESSAGE,
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
  updatedAt: Date;
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

interface UpdateMembershipFindFirstArguments {
  where: { userId: string; workspaceId: string };
  select: { role: true };
}

interface WorkspaceUpdateArguments {
  where: { id: string };
  data: {
    name?: string;
    description?: string | null;
  };
  select: {
    id: true;
    name: true;
    slug: true;
    description: true;
    createdAt: true;
    updatedAt: true;
  };
}

interface TransactionClient {
  workspaceMember: {
    findFirst: (
      arguments_: UpdateMembershipFindFirstArguments,
    ) => Promise<{ role: WorkspaceRoleName } | null>;
  };
  workspace: {
    update: (
      arguments_: WorkspaceUpdateArguments,
    ) => Promise<StoredWorkspace>;
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
  updatedAt: string;
}

interface ErrorResponseBody {
  message: string;
}

const WORKSPACE_UUID = '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02';
const UPDATED_AT = new Date('2026-11-03T12:00:00.000Z');

describe('Workspaces update (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let sessions: StoredSession[];
  let workspaces: StoredWorkspace[];
  let memberships: StoredMembership[];
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
      const transactionClient: TransactionClient = {
        workspaceMember: {
          findFirst: (arguments_) => {
            const membership = memberships.find(
              (candidate) =>
                candidate.userId === arguments_.where.userId &&
                candidate.workspaceId ===
                  arguments_.where.workspaceId,
            );

            return Promise.resolve(
              membership ? { role: membership.role } : null,
            );
          },
        },
        workspace: {
          update: (arguments_) => {
            const workspace = workspaces.find(
              (candidate) => candidate.id === arguments_.where.id,
            );

            if (!workspace) {
              return Promise.reject(new Error('workspace not found'));
            }

            if (arguments_.data.name !== undefined) {
              workspace.name = arguments_.data.name;
            }

            if ('description' in arguments_.data) {
              workspace.description =
                arguments_.data.description ?? null;
            }

            workspace.updatedAt = UPDATED_AT;

            return Promise.resolve({ ...workspace });
          },
        },
      };

      return callback(transactionClient);
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

  function addWorkspace(
    id: string,
    options: Partial<StoredWorkspace> = {},
  ): StoredWorkspace {
    const workspace: StoredWorkspace = {
      id,
      name: options.name ?? 'Project Workspace',
      slug: options.slug ?? 'project-workspace-12345678',
      description:
        options.description === undefined
          ? 'Original description'
          : options.description,
      createdAt:
        options.createdAt ?? new Date('2026-11-02T12:00:00.000Z'),
      updatedAt:
        options.updatedAt ?? new Date('2026-11-02T13:00:00.000Z'),
    };

    workspaces.push(workspace);

    return workspace;
  }

  function addMembership(
    userId: string,
    workspaceId: string,
    role: WorkspaceRoleName,
  ): StoredMembership {
    const membership: StoredMembership = {
      id: `membership-${memberships.length + 1}`,
      workspaceId,
      userId,
      role,
    };

    memberships.push(membership);

    return membership;
  }

  function createAuthenticatedUser(): { token: string } {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token);

    return { token };
  }

  function updateWorkspace(
    token: string | undefined,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    const test = request(app.getHttpServer())
      .patch(`/workspaces/${id}`)
      .send(body);

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  it('rejects unauthenticated updates', async () => {
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await updateWorkspace(undefined, WORKSPACE_UUID, {
      name: 'Renamed Workspace',
    }).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('allows an owner to update the workspace name', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await updateWorkspace(token, WORKSPACE_UUID, {
      name: '  Renamed Workspace  ',
    }).expect(200);
    const body = response.body as WorkspaceResponseBody;

    expect(body).toEqual({
      id: WORKSPACE_UUID,
      name: 'Renamed Workspace',
      slug: 'project-workspace-12345678',
      description: 'Original description',
      role: 'OWNER',
      createdAt: '2026-11-02T12:00:00.000Z',
      updatedAt: UPDATED_AT.toISOString(),
    });
    expect(workspaces[0]).toMatchObject({
      id: WORKSPACE_UUID,
      name: 'Renamed Workspace',
      slug: 'project-workspace-12345678',
      description: 'Original description',
      createdAt: new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: UPDATED_AT,
    });
  });

  it('allows an admin to update the workspace description', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'ADMIN');

    const response = await updateWorkspace(token, WORKSPACE_UUID, {
      description: '  Updated description  ',
    }).expect(200);
    const body = response.body as WorkspaceResponseBody;

    expect(body.description).toBe('Updated description');
    expect(body.role).toBe('ADMIN');
    expect(body.name).toBe('Project Workspace');
    expect(workspaces[0]?.description).toBe('Updated description');
  });

  it('clears the description when null is supplied', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await updateWorkspace(token, WORKSPACE_UUID, {
      description: null,
    }).expect(200);
    const body = response.body as WorkspaceResponseBody;

    expect(body.description).toBeNull();
    expect(workspaces[0]?.description).toBeNull();
  });

  it('forbids a member from updating workspace details', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'MEMBER');

    const response = await updateWorkspace(token, WORKSPACE_UUID, {
      name: 'Renamed Workspace',
    }).expect(403);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_UPDATE_FORBIDDEN_MESSAGE,
    );
    expect(workspaces[0]?.name).toBe('Project Workspace');
    expect(workspaces[0]?.updatedAt).toEqual(
      new Date('2026-11-02T13:00:00.000Z'),
    );
  });

  it('returns 404 for a non-member without changing the workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-2', WORKSPACE_UUID, 'OWNER');

    const response = await updateWorkspace(token, WORKSPACE_UUID, {
      name: 'Renamed Workspace',
    }).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(workspaces[0]?.name).toBe('Project Workspace');
  });

  it('returns 404 for a nonexistent workspace', async () => {
    const { token } = createAuthenticatedUser();

    const response = await updateWorkspace(token, WORKSPACE_UUID, {
      name: 'Renamed Workspace',
    }).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
  });

  it('rejects an empty update body', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await updateWorkspace(
      token,
      WORKSPACE_UUID,
      {},
    ).expect(400);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_UPDATE_EMPTY_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid workspace names', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    for (const name of [
      '',
      '   ',
      null,
      123,
      'a'.repeat(WORKSPACE_NAME_MAX_LENGTH + 1),
    ]) {
      await updateWorkspace(token, WORKSPACE_UUID, { name }).expect(
        400,
      );
    }

    expect(workspaces[0]?.name).toBe('Project Workspace');
  });

  it('rejects descriptions over the API limit', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    await updateWorkspace(token, WORKSPACE_UUID, {
      description: 'a'.repeat(WORKSPACE_DESCRIPTION_MAX_LENGTH + 1),
    }).expect(400);

    expect(workspaces[0]?.description).toBe('Original description');
  });

  it('rejects unknown fields and protected workspace fields', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    for (const body of [
      { name: 'Renamed Workspace', slug: 'renamed' },
      { name: 'Renamed Workspace', id: 'other-workspace' },
      { name: 'Renamed Workspace', ownerId: 'user-2' },
      { name: 'Renamed Workspace', userId: 'user-2' },
      { name: 'Renamed Workspace', role: 'OWNER' },
      { name: 'Renamed Workspace', createdAt: new Date() },
    ]) {
      await updateWorkspace(token, WORKSPACE_UUID, body).expect(400);
    }

    expect(workspaces[0]?.name).toBe('Project Workspace');
  });

  it('rejects an invalid workspace id format', async () => {
    const { token } = createAuthenticatedUser();

    await updateWorkspace(token, 'not-a-uuid', {
      name: 'Renamed Workspace',
    }).expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not expose sensitive workspace fields', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await updateWorkspace(token, WORKSPACE_UUID, {
      name: 'Renamed Workspace',
    }).expect(200);
    const body = response.body as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'role',
      'slug',
      'updatedAt',
    ]);
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('sessions');
    expect(body).not.toHaveProperty('tokenHash');
    expect(body).not.toHaveProperty('invitations');
    expect(body).not.toHaveProperty('members');
  });
});
