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
import { WORKSPACE_NOT_FOUND_MESSAGE } from './../src/workspaces/workspace.constants';
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

interface MembershipFindManyArguments {
  where: { userId: string };
  orderBy: [
    { workspace: { createdAt: 'desc' } },
    { workspaceId: 'desc' },
  ];
  skip: number;
  take: number;
  select: {
    role: true;
    workspace: {
      select: {
        id: true;
        name: true;
        slug: true;
        description: true;
        createdAt: true;
        updatedAt: true;
      };
    };
  };
}

interface MembershipCountArguments {
  where: { userId: string };
}

interface MembershipFindFirstArguments {
  where: { userId: string; workspaceId: string };
  select: {
    role: true;
    workspace: {
      select: {
        id: true;
        name: true;
        slug: true;
        description: true;
        createdAt: true;
        updatedAt: true;
      };
    };
  };
}

interface WorkspaceListResponseBody {
  items: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    role: WorkspaceRoleName;
    createdAt: string;
    updatedAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

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

describe('Workspaces list and retrieve (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let sessions: StoredSession[];
  let workspaces: StoredWorkspace[];
  let memberships: StoredMembership[];
  let findUnique: jest.MockedFunction<
    (arguments_: SessionFindUniqueArguments) => Promise<FoundSession | null>
  >;
  let findMany: jest.MockedFunction<
    (arguments_: MembershipFindManyArguments) => Promise<
      Array<{
        role: WorkspaceRoleName;
        workspace: StoredWorkspace;
      }>
    >
  >;
  let count: jest.MockedFunction<
    (arguments_: MembershipCountArguments) => Promise<number>
  >;
  let findFirst: jest.MockedFunction<
    (arguments_: MembershipFindFirstArguments) => Promise<
      | {
          role: WorkspaceRoleName;
          workspace: StoredWorkspace;
        }
      | null
    >
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
    findMany = jest.fn((arguments_) => {
      const userMemberships = memberships
        .filter(
          (membership) => membership.userId === arguments_.where.userId,
        )
        .sort((left, right) => {
          const leftWorkspace = workspaces.find(
            (workspace) => workspace.id === left.workspaceId,
          );
          const rightWorkspace = workspaces.find(
            (workspace) => workspace.id === right.workspaceId,
          );
          const leftTime =
            leftWorkspace?.createdAt.getTime() ?? 0;
          const rightTime =
            rightWorkspace?.createdAt.getTime() ?? 0;

          if (rightTime !== leftTime) {
            return rightTime - leftTime;
          }

          return right.workspaceId.localeCompare(left.workspaceId);
        });

      const page = userMemberships.slice(
        arguments_.skip,
        arguments_.skip + arguments_.take,
      );

      return Promise.resolve(
        page
          .map((membership) => {
            const workspace = workspaces.find(
              (candidate) =>
                candidate.id === membership.workspaceId,
            );

            if (!workspace) {
              return null;
            }

            return {
              role: membership.role,
              workspace,
            };
          })
          .filter(
            (
              membership,
            ): membership is {
              role: WorkspaceRoleName;
              workspace: StoredWorkspace;
            } => membership !== null,
          ),
      );
    });
    count = jest.fn((arguments_) =>
      Promise.resolve(
        memberships.filter(
          (membership) => membership.userId === arguments_.where.userId,
        ).length,
      ),
    );
    findFirst = jest.fn((arguments_) => {
      const membership = memberships.find(
        (candidate) =>
          candidate.userId === arguments_.where.userId &&
          candidate.workspaceId === arguments_.where.workspaceId,
      );

      if (!membership) {
        return Promise.resolve(null);
      }

      const workspace = workspaces.find(
        (candidate) => candidate.id === membership.workspaceId,
      );

      if (!workspace) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        role: membership.role,
        workspace,
      });
    });

    const database = {
      client: {
        session: { findUnique },
        workspaceMember: { findMany, count, findFirst },
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
      name: options.name ?? id,
      slug: options.slug ?? `${id}-slug`,
      description: options.description ?? null,
      createdAt: options.createdAt ?? new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: options.updatedAt ?? new Date('2026-11-02T13:00:00.000Z'),
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

  function listWorkspaces(
    token?: string,
    query: Record<string, unknown> = {},
  ): request.Test {
    const test = request(app.getHttpServer())
      .get('/workspaces')
      .query(query);

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function getWorkspace(
    token: string | undefined,
    id: string,
  ): request.Test {
    const test = request(app.getHttpServer()).get(`/workspaces/${id}`);

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function createAuthenticatedUser(): { token: string } {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token);

    return { token };
  }

  it('rejects GET /workspaces without authentication', async () => {
    const response = await listWorkspaces().expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns only the current user workspaces with roles and pagination', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace('workspace-1', {
      name: 'First',
      description: 'First',
      createdAt: new Date('2026-11-02T08:00:00.000Z'),
      updatedAt: new Date('2026-11-02T09:00:00.000Z'),
    });
    addWorkspace('workspace-2', {
      name: 'Second',
      description: null,
      createdAt: new Date('2026-11-01T08:00:00.000Z'),
      updatedAt: new Date('2026-11-01T09:00:00.000Z'),
    });
    addWorkspace('workspace-3');
    addMembership('user-1', 'workspace-1', 'OWNER');
    addMembership('user-1', 'workspace-2', 'MEMBER');
    addMembership('user-2', 'workspace-3', 'ADMIN');

    const response = await listWorkspaces(token).expect(200);
    const body = response.body as WorkspaceListResponseBody;

    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toEqual({
      id: 'workspace-1',
      name: 'First',
      slug: 'workspace-1-slug',
      description: 'First',
      role: 'OWNER',
      createdAt: '2026-11-02T08:00:00.000Z',
      updatedAt: '2026-11-02T09:00:00.000Z',
    });
    expect(body.items[1]).toEqual({
      id: 'workspace-2',
      name: 'Second',
      slug: 'workspace-2-slug',
      description: null,
      role: 'MEMBER',
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T09:00:00.000Z',
    });
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
    expect(body.items[0]).not.toHaveProperty('userId');
    expect(body.items[0]).not.toHaveProperty('members');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
      }),
    );
  });

  it('returns an empty list when the user has no memberships', async () => {
    const { token } = createAuthenticatedUser();

    const response = await listWorkspaces(token).expect(200);
    const body = response.body as WorkspaceListResponseBody;

    expect(body.items).toEqual([]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('paginates workspaces for the current user', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace('workspace-1');
    addWorkspace('workspace-2');
    addWorkspace('workspace-3');
    addMembership('user-1', 'workspace-1', 'OWNER');
    addMembership('user-1', 'workspace-2', 'ADMIN');
    addMembership('user-1', 'workspace-3', 'MEMBER');

    const response = await listWorkspaces(token, {
      page: 2,
      limit: 1,
    }).expect(200);
    const body = response.body as WorkspaceListResponseBody;

    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe('workspace-2');
    expect(body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        take: 1,
      }),
    );
  });

  it('rejects invalid pagination and client-supplied user filters', async () => {
    const { token } = createAuthenticatedUser();

    for (const query of [
      { page: 0 },
      { limit: 0 },
      { limit: 101 },
      { page: 'not-a-number' },
      { userId: 'user-2' },
    ]) {
      await listWorkspaces(token, query).expect(400);
    }

    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('rejects GET /workspaces/:id without authentication', async () => {
    const response = await getWorkspace(undefined, WORKSPACE_UUID).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns workspace details for an active member', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID, {
      name: 'Project Workspace',
      slug: 'project-workspace-12345678',
      description: 'Details',
      createdAt: new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: new Date('2026-11-02T14:00:00.000Z'),
    });
    addMembership('user-1', WORKSPACE_UUID, 'ADMIN');

    const response = await getWorkspace(token, WORKSPACE_UUID).expect(200);
    const body = response.body as WorkspaceResponseBody;

    expect(body).toEqual({
      id: WORKSPACE_UUID,
      name: 'Project Workspace',
      slug: 'project-workspace-12345678',
      description: 'Details',
      role: 'ADMIN',
      createdAt: '2026-11-02T12:00:00.000Z',
      updatedAt: '2026-11-02T14:00:00.000Z',
    });
    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'role',
      'slug',
      'updatedAt',
    ]);
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('members');
  });

  it('returns 404 for a non-member workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-2', WORKSPACE_UUID, 'OWNER');

    const response = await getWorkspace(token, WORKSPACE_UUID).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: WORKSPACE_UUID },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  });

  it('returns 404 for a nonexistent workspace', async () => {
    const { token } = createAuthenticatedUser();

    const response = await getWorkspace(token, WORKSPACE_UUID).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
  });

  it('returns 400 for an invalid workspace id format', async () => {
    const { token } = createAuthenticatedUser();

    await getWorkspace(token, 'not-a-uuid').expect(400);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('does not expose sensitive fields in workspace details', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(WORKSPACE_UUID);
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await getWorkspace(token, WORKSPACE_UUID).expect(200);
    const body = response.body as Record<string, unknown>;

    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('sessions');
    expect(body).not.toHaveProperty('tokenHash');
    expect(body).not.toHaveProperty('invitations');
    expect(body).not.toHaveProperty('members');
  });
});
