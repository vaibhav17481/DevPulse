import {
  INestApplication,
  ServiceUnavailableException,
} from '@nestjs/common';
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
  PROJECT_CREATION_CONFLICT_MESSAGE,
  PROJECT_CREATION_FAILED_MESSAGE,
  PROJECT_CREATION_FORBIDDEN_MESSAGE,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NOT_FOUND_MESSAGE,
  PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
  PROJECT_REPOSITORY_ARCHIVED_MESSAGE,
  PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
  PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE,
  PROJECT_UPDATE_EMPTY_MESSAGE,
  PROJECT_UPDATE_FORBIDDEN_MESSAGE,
} from './../src/projects/project.constants';
import type {
  RepositoryConnectionStatusName,
  RepositoryVisibilityName,
} from './../src/projects/project.types';
import {
  GITHUB_REPOSITORY_RESOLVER,
  type ResolvedGitHubRepository,
} from './../src/projects/repository-resolver';
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

interface StoredInstallation {
  id: string;
  workspaceId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED';
}

interface StoredProject {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredRepository {
  id: string;
  workspaceId: string;
  projectId: string;
  installationId: string;
  githubId: bigint;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  visibility: RepositoryVisibilityName;
  isArchived: boolean;
  connectionStatus: RepositoryConnectionStatusName;
  connectedAt: Date;
  disconnectedAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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

interface MembershipFindArguments {
  where: { userId: string; workspaceId: string };
  select: { role: true };
}

interface RepositoryFindUniqueArguments {
  where: { githubId: bigint };
  select: { id: true };
}

interface InstallationFindFirstArguments {
  where: { id: string; workspaceId: string; status: 'ACTIVE' };
  select: { id: true };
}

interface ProjectCreateArguments {
  data: {
    workspaceId: string;
    name: string;
    slug: string;
    description: string | null;
  };
  select: {
    id: true;
    workspaceId: true;
    name: true;
    description: true;
    createdAt: true;
    updatedAt: true;
  };
}

interface ProjectListFindManyArguments {
  where: { workspaceId: string };
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }];
  skip: number;
  take: number;
  select: Record<string, unknown>;
}

interface ProjectCountArguments {
  where: { workspaceId: string };
}

interface ProjectFindFirstArguments {
  where: { id: string; workspaceId: string };
  select: Record<string, unknown>;
}

interface ProjectUpdateArguments {
  where: { id_workspaceId: { id: string; workspaceId: string } };
  data: {
    name?: string;
    description?: string | null;
  };
  select: Record<string, unknown>;
}

interface RepositoryCreateArguments {
  data: {
    workspaceId: string;
    projectId: string;
    installationId: string;
    githubId: bigint;
    ownerLogin: string;
    name: string;
    fullName: string;
    defaultBranch: string | null;
    visibility: RepositoryVisibilityName;
    isArchived: boolean;
    connectionStatus: 'ACTIVE';
  };
  select: {
    id: true;
    githubId: true;
    ownerLogin: true;
    name: true;
    fullName: true;
    defaultBranch: true;
    visibility: true;
    isArchived: true;
    connectionStatus: true;
    connectedAt: true;
    disconnectedAt: true;
    lastSyncedAt: true;
  };
}

interface TransactionClient {
  workspaceMember: {
    findFirst: (
      arguments_: MembershipFindArguments,
    ) => Promise<{ role: WorkspaceRoleName } | null>;
  };
  repository: {
    findUnique: (
      arguments_: RepositoryFindUniqueArguments,
    ) => Promise<{ id: string } | null>;
    create: (
      arguments_: RepositoryCreateArguments,
    ) => Promise<StoredRepository>;
  };
  gitHubInstallation: {
    findFirst: (
      arguments_: InstallationFindFirstArguments,
    ) => Promise<{ id: string } | null>;
  };
  project: {
    create: (
      arguments_: ProjectCreateArguments,
    ) => Promise<StoredProject>;
    update: (
      arguments_: ProjectUpdateArguments,
    ) => Promise<
      StoredProject & { repository: StoredRepository | null }
    >;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

interface ProjectResponseBody {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  repository: {
    id: string;
    githubId: string;
    ownerLogin: string;
    name: string;
    fullName: string;
    defaultBranch: string | null;
    visibility: RepositoryVisibilityName;
    isArchived: boolean;
    connectionStatus: RepositoryConnectionStatusName;
    connectedAt: string;
    disconnectedAt: string | null;
    lastSyncedAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface ProjectListResponseBody {
  items: ProjectResponseBody[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ErrorResponseBody {
  message: string;
}

const WORKSPACE_UUID = '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02';
const OTHER_WORKSPACE_UUID = '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081';
const PROJECT_UUID = '8f0a7c2e-1f9b-4d10-9a2b-3c4d5e6f7081';
const OTHER_PROJECT_UUID = '2c3d4e5f-6071-4829-8a3b-4c5d6e7f8092';
const INSTALLATION_ID = 'installation-1';
const CREATED_AT = new Date('2026-11-04T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-04T10:00:00.000Z');
const PROJECT_UPDATED_AT = new Date('2026-11-04T12:00:00.000Z');
const REPOSITORY_GITHUB_ID = 123456789n;

const RESOLVED_REPOSITORY: ResolvedGitHubRepository = {
  githubId: REPOSITORY_GITHUB_ID,
  installationId: INSTALLATION_ID,
  ownerLogin: 'acme',
  name: 'checkout-api',
  fullName: 'acme/checkout-api',
  defaultBranch: 'main',
  visibility: 'PRIVATE',
  isArchived: false,
};

type RepositoryCreateFailure = 'error' | 'unique' | undefined;

function databaseError(code: string): Error {
  return Object.assign(new Error(`Database error ${code}`), { code });
}

describe('Projects creation (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let sessions: StoredSession[];
  let workspaces: StoredWorkspace[];
  let memberships: StoredMembership[];
  let installations: StoredInstallation[];
  let projects: StoredProject[];
  let repositories: StoredRepository[];
  let repositoryCreateFailure: RepositoryCreateFailure;
  let findUnique: jest.MockedFunction<
    (arguments_: SessionFindUniqueArguments) => Promise<FoundSession | null>
  >;
  let findMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{
      role: WorkspaceRoleName;
    } | null>
  >;
  let findManyProjects: jest.MockedFunction<
    (arguments_: ProjectListFindManyArguments) => Promise<StoredProject[]>
  >;
  let countProjects: jest.MockedFunction<
    (arguments_: ProjectCountArguments) => Promise<number>
  >;
  let findProject: jest.MockedFunction<
    (arguments_: ProjectFindFirstArguments) => Promise<StoredProject | null>
  >;
  let findExistingRepository: jest.MockedFunction<
    (arguments_: RepositoryFindUniqueArguments) => Promise<{
      id: string;
    } | null>
  >;
  let resolveRepository: jest.MockedFunction<
    (
      workspaceId: string,
      githubId: bigint,
    ) => Promise<ResolvedGitHubRepository>
  >;
  let transaction: jest.MockedFunction<
    (callback: TransactionCallback) => Promise<unknown>
  >;

  beforeEach(async () => {
    users = new Map();
    sessions = [];
    workspaces = [];
    memberships = [];
    installations = [];
    projects = [];
    repositories = [];
    repositoryCreateFailure = undefined;

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
    findMembership = jest.fn((arguments_) => {
      const membership = memberships.find(
        (candidate) =>
          candidate.userId === arguments_.where.userId &&
          candidate.workspaceId === arguments_.where.workspaceId,
      );

      return Promise.resolve(
        membership ? { role: membership.role } : null,
      );
    });
    findManyProjects = jest.fn((arguments_) => {
      const workspaceProjects = projects
        .filter(
          (project) =>
            project.workspaceId === arguments_.where.workspaceId,
        )
        .sort((left, right) => {
          const timeDifference =
            right.createdAt.getTime() - left.createdAt.getTime();

          if (timeDifference !== 0) {
            return timeDifference;
          }

          return right.id.localeCompare(left.id);
        });
      const page = workspaceProjects.slice(
        arguments_.skip,
        arguments_.skip + arguments_.take,
      );

      return Promise.resolve(
        page.map((project) => ({
          ...project,
          repository:
            repositories.find(
              (repository) => repository.projectId === project.id,
            ) ?? null,
        })),
      );
    });
    countProjects = jest.fn((arguments_) =>
      Promise.resolve(
        projects.filter(
          (project) =>
            project.workspaceId === arguments_.where.workspaceId,
        ).length,
      ),
    );
    findProject = jest.fn((arguments_) => {
      const project = projects.find(
        (candidate) =>
          candidate.id === arguments_.where.id &&
          candidate.workspaceId === arguments_.where.workspaceId,
      );

      if (!project) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        ...project,
        repository:
          repositories.find(
            (repository) => repository.projectId === project.id,
          ) ?? null,
      });
    });
    findExistingRepository = jest.fn((arguments_) => {
      const repository = repositories.find(
        (candidate) => candidate.githubId === arguments_.where.githubId,
      );

      return Promise.resolve(
        repository ? { id: repository.id } : null,
      );
    });
    resolveRepository = jest.fn((workspaceId, githubId) => {
      void workspaceId;
      void githubId;

      return Promise.resolve({ ...RESOLVED_REPOSITORY });
    });
    transaction = jest.fn(async (callback) => {
      const stateProjects = [...projects];
      const stateRepositories = [...repositories];
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
        repository: {
          findUnique: (arguments_) => {
            const repository = stateRepositories.find(
              (candidate) =>
                candidate.githubId === arguments_.where.githubId,
            );

            return Promise.resolve(
              repository ? { id: repository.id } : null,
            );
          },
          create: (arguments_) => {
            if (repositoryCreateFailure === 'error') {
              return Promise.reject(
                new Error('repository insert failed'),
              );
            }

            if (
              repositoryCreateFailure === 'unique' ||
              stateRepositories.some(
                (repository) =>
                  repository.githubId === arguments_.data.githubId,
              )
            ) {
              return Promise.reject(databaseError('P2002'));
            }

            if (
              !stateProjects.some(
                (project) => project.id === arguments_.data.projectId,
              )
            ) {
              return Promise.reject(databaseError('P2003'));
            }

            const repository: StoredRepository = {
              id: `repository-${stateRepositories.length + 1}`,
              workspaceId: arguments_.data.workspaceId,
              projectId: arguments_.data.projectId,
              installationId: arguments_.data.installationId,
              githubId: arguments_.data.githubId,
              ownerLogin: arguments_.data.ownerLogin,
              name: arguments_.data.name,
              fullName: arguments_.data.fullName,
              defaultBranch: arguments_.data.defaultBranch,
              visibility: arguments_.data.visibility,
              isArchived: arguments_.data.isArchived,
              connectionStatus: arguments_.data.connectionStatus,
              connectedAt: CREATED_AT,
              disconnectedAt: null,
              lastSyncedAt: null,
              createdAt: CREATED_AT,
              updatedAt: UPDATED_AT,
            };

            stateRepositories.push(repository);

            return Promise.resolve(repository);
          },
        },
        gitHubInstallation: {
          findFirst: (arguments_) => {
            const installation = installations.find(
              (candidate) =>
                candidate.id === arguments_.where.id &&
                candidate.workspaceId ===
                  arguments_.where.workspaceId &&
                candidate.status === arguments_.where.status,
            );

            return Promise.resolve(installation ?? null);
          },
        },
        project: {
          create: (arguments_) => {
            const project: StoredProject = {
              id: `project-${stateProjects.length + 1}`,
              workspaceId: arguments_.data.workspaceId,
              name: arguments_.data.name,
              slug: arguments_.data.slug,
              description: arguments_.data.description,
              createdAt: CREATED_AT,
              updatedAt: UPDATED_AT,
            };

            stateProjects.push(project);

            return Promise.resolve(project);
          },
          update: (arguments_) => {
            const projectIndex = stateProjects.findIndex(
              (project) =>
                project.id ===
                  arguments_.where.id_workspaceId.id &&
                project.workspaceId ===
                  arguments_.where.id_workspaceId.workspaceId,
            );
            const currentProject = stateProjects[projectIndex];

            if (!currentProject) {
              return Promise.reject(databaseError('P2025'));
            }

            const updatedProject: StoredProject = {
              ...currentProject,
              ...(arguments_.data.name !== undefined
                ? { name: arguments_.data.name }
                : {}),
              ...(arguments_.data.description !== undefined
                ? {
                    description: arguments_.data.description,
                  }
                : {}),
              updatedAt: PROJECT_UPDATED_AT,
            };

            stateProjects[projectIndex] = updatedProject;

            return Promise.resolve({
              ...updatedProject,
              repository:
                stateRepositories.find(
                  (repository) =>
                    repository.projectId === updatedProject.id,
                ) ?? null,
            });
          },
        },
      };

      const result = await callback(transactionClient);

      projects = stateProjects;
      repositories = stateRepositories;

      return result;
    });

    const database = {
      client: {
        session: { findUnique },
        workspaceMember: { findFirst: findMembership },
        project: {
          findMany: findManyProjects,
          findFirst: findProject,
          count: countProjects,
        },
        repository: { findUnique: findExistingRepository },
        $transaction: transaction,
      },
      onModuleDestroy: (): Promise<void> => Promise.resolve(),
    } as unknown as DatabaseService;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(GITHUB_REPOSITORY_RESOLVER)
      .useValue({ resolve: resolveRepository })
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
    id = WORKSPACE_UUID,
    name = 'Platform Engineering',
  ): StoredWorkspace {
    const workspace: StoredWorkspace = {
      id,
      name,
      slug: `${id}-slug`,
      description: null,
      createdAt: new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: new Date('2026-11-02T13:00:00.000Z'),
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

  function addInstallation(
    id = INSTALLATION_ID,
    workspaceId = WORKSPACE_UUID,
    status: StoredInstallation['status'] = 'ACTIVE',
  ): StoredInstallation {
    const installation = { id, workspaceId, status };
    installations.push(installation);

    return installation;
  }

  function addRepository(
    githubId: bigint,
    workspaceId = OTHER_WORKSPACE_UUID,
  ): StoredRepository {
    const repository: StoredRepository = {
      id: `repository-${repositories.length + 1}`,
      workspaceId,
      projectId: `project-existing-${repositories.length + 1}`,
      installationId: 'installation-existing',
      githubId,
      ownerLogin: 'other',
      name: 'existing-repository',
      fullName: 'other/existing-repository',
      defaultBranch: 'main',
      visibility: 'PRIVATE',
      isArchived: false,
      connectionStatus: 'ACTIVE',
      connectedAt: new Date('2026-11-01T10:00:00.000Z'),
      disconnectedAt: null,
      lastSyncedAt: null,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    };

    repositories.push(repository);

    return repository;
  }

  function createAuthenticatedUser(): { token: string } {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token);

    return { token };
  }

  function createProject(
    token: string | undefined,
    workspaceId: string,
    body: Record<string, unknown>,
  ): request.Test {
    const test = request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/projects`)
      .send(body);

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function listProjects(
    token: string | undefined,
    workspaceId: string,
    query: Record<string, string | number | undefined> = {},
  ): request.Test {
    const test = request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/projects`)
      .query(query);

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function getProject(
    token: string | undefined,
    workspaceId: string,
    projectId: string,
  ): request.Test {
    const test = request(app.getHttpServer()).get(
      `/workspaces/${workspaceId}/projects/${projectId}`,
    );

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function updateProject(
    token: string | undefined,
    workspaceId: string,
    projectId: string,
    body: Record<string, unknown>,
  ): request.Test {
    const test = request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/projects/${projectId}`)
      .send(body);

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function addProject(
    id: string,
    workspaceId: string,
    createdAt: string,
    options: {
      name?: string;
      githubId?: bigint;
      repository?: boolean;
    } = {},
  ): StoredProject {
    const project: StoredProject = {
      id,
      workspaceId,
      name: options.name ?? `Project ${id}`,
      slug: `${id}-slug`,
      description: null,
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    };

    projects.push(project);

    if (options.repository !== false) {
      repositories.push({
        id: `repository-${id}`,
        workspaceId,
        projectId: id,
        installationId: INSTALLATION_ID,
        githubId: options.githubId ?? 1000n + BigInt(projects.length),
        ownerLogin: 'acme',
        name: id,
        fullName: `acme/${id}`,
        defaultBranch: 'main',
        visibility: 'PRIVATE',
        isArchived: false,
        connectionStatus: 'ACTIVE',
        connectedAt: new Date(createdAt),
        disconnectedAt: null,
        lastSyncedAt: null,
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
      });
    }

    return project;
  }

  const validBody = {
    name: 'Checkout API',
    description: 'Checkout service',
    repositoryGithubId: REPOSITORY_GITHUB_ID.toString(),
  };

  it('rejects unauthenticated project creation', async () => {
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await createProject(
      undefined,
      WORKSPACE_UUID,
      validBody,
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid workspace UUID', async () => {
    const { token } = createAuthenticatedUser();

    await createProject(token, 'not-a-uuid', validBody).expect(400);

    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent workspace', async () => {
    const { token } = createAuthenticatedUser();

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-member without resolving the repository', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-2', WORKSPACE_UUID, 'OWNER');
    addInstallation();

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['MEMBER', 'VIEWER'] as const)(
    'forbids a %s from creating a project',
    async (role) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, role);
      addInstallation();

      const response = await createProject(
        token,
        WORKSPACE_UUID,
        validBody,
      ).expect(403);

      expect((response.body as ErrorResponseBody).message).toBe(
        PROJECT_CREATION_FORBIDDEN_MESSAGE,
      );
      expect(resolveRepository).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('creates a project and repository for an owner', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation();

    const response = await createProject(token, WORKSPACE_UUID, {
      name: '  Checkout API  ',
      description: '  Checkout service  ',
      repositoryGithubId: REPOSITORY_GITHUB_ID.toString(),
    }).expect(201);
    const body = response.body as ProjectResponseBody;

    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'repository',
      'updatedAt',
      'workspaceId',
    ]);
    expect(body.name).toBe('Checkout API');
    expect(body.description).toBe('Checkout service');
    expect(body.workspaceId).toBe(WORKSPACE_UUID);
    expect(body.createdAt).toBe(CREATED_AT.toISOString());
    expect(body.updatedAt).toBe(UPDATED_AT.toISOString());
    expect(body.repository).toEqual({
      id: 'repository-1',
      githubId: '123456789',
      ownerLogin: 'acme',
      name: 'checkout-api',
      fullName: 'acme/checkout-api',
      defaultBranch: 'main',
      visibility: 'PRIVATE',
      isArchived: false,
      connectionStatus: 'ACTIVE',
      connectedAt: CREATED_AT.toISOString(),
      disconnectedAt: null,
      lastSyncedAt: null,
    });
    expect(body).not.toHaveProperty('slug');
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('role');
    expect(body.repository).not.toHaveProperty('installationId');
    expect(body.repository).not.toHaveProperty('accessToken');
    expect(body.repository).not.toHaveProperty('token');

    expect(resolveRepository).toHaveBeenCalledWith(
      WORKSPACE_UUID,
      REPOSITORY_GITHUB_ID,
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: body.id,
      workspaceId: WORKSPACE_UUID,
      name: 'Checkout API',
      description: 'Checkout service',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
    expect(projects[0]?.slug).toMatch(/^checkout-api-[a-f0-9]{8}$/);
    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toMatchObject({
      id: body.repository.id,
      workspaceId: WORKSPACE_UUID,
      projectId: body.id,
      installationId: INSTALLATION_ID,
      githubId: REPOSITORY_GITHUB_ID,
      ownerLogin: 'acme',
      name: 'checkout-api',
      fullName: 'acme/checkout-api',
      defaultBranch: 'main',
      visibility: 'PRIVATE',
      isArchived: false,
      connectionStatus: 'ACTIVE',
    });
  });

  it('allows an admin to create a project with no description', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'ADMIN');
    addInstallation();

    const response = await createProject(token, WORKSPACE_UUID, {
      name: 'Checkout API',
      repositoryGithubId: REPOSITORY_GITHUB_ID.toString(),
    }).expect(201);

    expect(
      (response.body as ProjectResponseBody).description,
    ).toBeNull();
    expect(projects[0]?.description).toBeNull();
    expect(repositories).toHaveLength(1);
  });

  it('rejects invalid project request bodies', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation();

    const bodies: Array<Record<string, unknown>> = [
      {},
      { repositoryGithubId: '123456789' },
      { name: '   ', repositoryGithubId: '123456789' },
      {
        name: 'a'.repeat(PROJECT_NAME_MAX_LENGTH + 1),
        repositoryGithubId: '123456789',
      },
      {
        name: 'Checkout API',
        description: 'a'.repeat(
          PROJECT_DESCRIPTION_MAX_LENGTH + 1,
        ),
        repositoryGithubId: '123456789',
      },
      {
        name: 'Checkout API',
        description: 123,
        repositoryGithubId: '123456789',
      },
      { name: 'Checkout API' },
      { name: 'Checkout API', repositoryGithubId: 123 },
      { name: 'Checkout API', repositoryGithubId: 'abc' },
      { name: 'Checkout API', repositoryGithubId: '0' },
      { name: 'Checkout API', repositoryGithubId: '0001' },
      {
        name: 'Checkout API',
        repositoryGithubId: '1'.repeat(20),
      },
      {
        name: 'Checkout API',
        repositoryGithubId: '123456789',
        repositoryId: 'repository-1',
      },
      {
        name: 'Checkout API',
        repositoryGithubId: '123456789',
        workspaceId: OTHER_WORKSPACE_UUID,
      },
      {
        name: 'Checkout API',
        repositoryGithubId: '123456789',
        userId: 'user-2',
      },
      {
        name: 'Checkout API',
        repositoryGithubId: '123456789',
        role: 'OWNER',
      },
      {
        name: 'Checkout API',
        repositoryGithubId: '123456789',
        slug: 'checkout-api',
      },
      {
        name: 'Checkout API',
        repositoryGithubId: '123456789',
        repository: { ownerLogin: 'acme', name: 'checkout-api' },
      },
    ];

    for (const body of bodies) {
      await createProject(token, WORKSPACE_UUID, body).expect(400);
    }

    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(projects).toEqual([]);
    expect(repositories).toEqual([]);
  });

  it('rejects a repository already connected elsewhere', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation();
    addRepository(REPOSITORY_GITHUB_ID);

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(409);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
    );
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(projects).toEqual([]);
  });

  it('rejects an archived repository', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation();
    resolveRepository.mockResolvedValue({
      ...RESOLVED_REPOSITORY,
      isArchived: true,
    });

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(400);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_REPOSITORY_ARCHIVED_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(projects).toEqual([]);
  });

  it('rejects a repository whose installation belongs to another workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation('installation-1', OTHER_WORKSPACE_UUID);

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(projects).toEqual([]);
    expect(repositories).toEqual([]);
  });

  it.each(['SUSPENDED', 'DISCONNECTED'] as const)(
    'rejects a repository whose installation is %s',
    async (status) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, 'OWNER');
      addInstallation(INSTALLATION_ID, WORKSPACE_UUID, status);

      const response = await createProject(
        token,
        WORKSPACE_UUID,
        validBody,
      ).expect(404);

      expect((response.body as ErrorResponseBody).message).toBe(
        PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
      );
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(projects).toEqual([]);
      expect(repositories).toEqual([]);
    },
  );

  it('returns 503 when GitHub repository verification is unavailable', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation();
    resolveRepository.mockRejectedValue(
      new ServiceUnavailableException(
        PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE,
      ),
    );

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(503);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(projects).toEqual([]);
  });

  it('rolls back the project when repository creation fails', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation();
    repositoryCreateFailure = 'error';

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(500);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_CREATION_FAILED_MESSAGE,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(projects).toEqual([]);
    expect(repositories).toEqual([]);
  });

  it('maps a unique constraint race to a conflict without partial writes', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addInstallation();
    repositoryCreateFailure = 'unique';

    const response = await createProject(
      token,
      WORKSPACE_UUID,
      validBody,
    ).expect(409);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_CREATION_CONFLICT_MESSAGE,
    );
    expect(projects).toEqual([]);
    expect(repositories).toEqual([]);
  });


  it('rejects unauthenticated project listing', async () => {
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await listProjects(
      undefined,
      WORKSPACE_UUID,
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(findManyProjects).not.toHaveBeenCalled();
    expect(countProjects).not.toHaveBeenCalled();
  });

  it('rejects an invalid workspace UUID when listing projects', async () => {
    const { token } = createAuthenticatedUser();

    await listProjects(token, 'not-a-uuid').expect(400);

    expect(findManyProjects).not.toHaveBeenCalled();
    expect(countProjects).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent workspace when listing projects', async () => {
    const { token } = createAuthenticatedUser();

    const response = await listProjects(
      token,
      WORKSPACE_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findManyProjects).not.toHaveBeenCalled();
    expect(countProjects).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-member without querying projects', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-2', WORKSPACE_UUID, 'OWNER');
    addProject(
      'project-hidden',
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );

    const response = await listProjects(
      token,
      WORKSPACE_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findManyProjects).not.toHaveBeenCalled();
    expect(countProjects).not.toHaveBeenCalled();
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const)(
    'allows a %s to list projects',
    async (role) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, role);
      addProject(
        'project-1',
        WORKSPACE_UUID,
        '2026-11-04T10:00:00.000Z',
      );

      const response = await listProjects(
        token,
        WORKSPACE_UUID,
      ).expect(200);
      const body = response.body as ProjectListResponseBody;

      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.id).toBe('project-1');
    },
  );

  it('returns an empty project list for a member workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await listProjects(
      token,
      WORKSPACE_UUID,
    ).expect(200);
    const body = response.body as ProjectListResponseBody;

    expect(body).toEqual({
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it('lists only projects in the workspace with repository details', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addWorkspace(OTHER_WORKSPACE_UUID, 'Other Workspace');
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addMembership('user-1', OTHER_WORKSPACE_UUID, 'OWNER');
    addProject(
      'project-older',
      WORKSPACE_UUID,
      '2026-11-02T10:00:00.000Z',
      {
        name: 'Older Project',
        githubId: 111111111n,
      },
    );
    addProject(
      'project-newer',
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      {
        name: 'Newer Project',
        githubId: 222222222n,
      },
    );
    addProject(
      'project-other-workspace',
      OTHER_WORKSPACE_UUID,
      '2026-11-05T10:00:00.000Z',
      {
        name: 'Other Workspace Project',
        githubId: 333333333n,
      },
    );

    const response = await listProjects(
      token,
      WORKSPACE_UUID,
    ).expect(200);
    const body = response.body as ProjectListResponseBody;

    expect(body.items.map((project) => project.id)).toEqual([
      'project-newer',
      'project-older',
    ]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
    expect(body.items[0]?.workspaceId).toBe(WORKSPACE_UUID);
    expect(body.items[0]?.repository).toEqual({
      id: 'repository-project-newer',
      githubId: '222222222',
      ownerLogin: 'acme',
      name: 'project-newer',
      fullName: 'acme/project-newer',
      defaultBranch: 'main',
      visibility: 'PRIVATE',
      isArchived: false,
      connectionStatus: 'ACTIVE',
      connectedAt: '2026-11-04T10:00:00.000Z',
      disconnectedAt: null,
      lastSyncedAt: null,
    });
    expect(body.items[0]).not.toHaveProperty('slug');
    expect(body.items[0]?.repository).not.toHaveProperty(
      'installationId',
    );
    expect(body.items[0]?.repository).not.toHaveProperty(
      'accessToken',
    );
    expect(
      body.items.some(
        (project) => project.id === 'project-other-workspace',
      ),
    ).toBe(false);
  });

  it('paginates projects deterministically by creation time then ID', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      'project-a',
      WORKSPACE_UUID,
      '2026-11-03T10:00:00.000Z',
    );
    addProject(
      'project-b',
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );
    addProject(
      'project-c',
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );

    const response = await listProjects(token, WORKSPACE_UUID, {
      page: 1,
      limit: 2,
    }).expect(200);
    const body = response.body as ProjectListResponseBody;

    expect(body.items.map((project) => project.id)).toEqual([
      'project-c',
      'project-b',
    ]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    const secondPage = await listProjects(token, WORKSPACE_UUID, {
      page: 2,
      limit: 2,
    }).expect(200);
    const secondPageBody = secondPage.body as ProjectListResponseBody;

    expect(secondPageBody.items.map((project) => project.id)).toEqual([
      'project-a',
    ]);
  });

  it('represents a defensive missing repository as null', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      'project-without-repository',
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      { repository: false },
    );

    const response = await listProjects(
      token,
      WORKSPACE_UUID,
    ).expect(200);
    const body = response.body as ProjectListResponseBody;

    expect(body.items[0]?.repository).toBeNull();
  });

  it.each([
    { page: 0 },
    { page: 'not-a-number' },
    { limit: 0 },
    { limit: 101 },
    { limit: 'not-a-number' },
  ])(
    'rejects invalid project listing pagination: %j',
    async (query) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, 'OWNER');

      await listProjects(token, WORKSPACE_UUID, query).expect(
        400,
      );

      expect(findManyProjects).not.toHaveBeenCalled();
      expect(countProjects).not.toHaveBeenCalled();
    },
  );


  it('rejects unauthenticated project retrieval', async () => {
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );

    const response = await getProject(
      undefined,
      WORKSPACE_UUID,
      PROJECT_UUID,
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(findProject).not.toHaveBeenCalled();
  });

  it('rejects an invalid workspace UUID when retrieving a project', async () => {
    const { token } = createAuthenticatedUser();

    await getProject(token, 'not-a-uuid', PROJECT_UUID).expect(400);

    expect(findProject).not.toHaveBeenCalled();
  });

  it('rejects an invalid project UUID when retrieving a project', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    await getProject(token, WORKSPACE_UUID, 'not-a-uuid').expect(400);

    expect(findProject).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent workspace when retrieving a project', async () => {
    const { token } = createAuthenticatedUser();

    const response = await getProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findProject).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-member without querying the project', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-2', WORKSPACE_UUID, 'OWNER');
    addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );

    const response = await getProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findProject).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist in the workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await getProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_NOT_FOUND_MESSAGE,
    );
  });

  it('returns 404 for a project that belongs to another workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      OTHER_PROJECT_UUID,
      OTHER_WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );

    const response = await getProject(
      token,
      WORKSPACE_UUID,
      OTHER_PROJECT_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_NOT_FOUND_MESSAGE,
    );
    expect(findProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: OTHER_PROJECT_UUID,
          workspaceId: WORKSPACE_UUID,
        },
      }),
    );
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const)(
    'allows a %s to retrieve a project',
    async (role) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, role);
      addProject(
        PROJECT_UUID,
        WORKSPACE_UUID,
        '2026-11-04T10:00:00.000Z',
      );

      const response = await getProject(
        token,
        WORKSPACE_UUID,
        PROJECT_UUID,
      ).expect(200);
      const body = response.body as ProjectResponseBody;

      expect(body.id).toBe(PROJECT_UUID);
      expect(body.workspaceId).toBe(WORKSPACE_UUID);
    },
  );

  it('returns explicitly mapped project and repository details', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      {
        name: 'Checkout API',
        githubId: 123456789n,
      },
    );

    const response = await getProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
    ).expect(200);
    const body = response.body as ProjectResponseBody;

    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'repository',
      'updatedAt',
      'workspaceId',
    ]);
    expect(body).toMatchObject({
      id: PROJECT_UUID,
      workspaceId: WORKSPACE_UUID,
      name: 'Checkout API',
      description: null,
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
    });
    expect(body.repository).toEqual({
      id: `repository-${PROJECT_UUID}`,
      githubId: '123456789',
      ownerLogin: 'acme',
      name: PROJECT_UUID,
      fullName: `acme/${PROJECT_UUID}`,
      defaultBranch: 'main',
      visibility: 'PRIVATE',
      isArchived: false,
      connectionStatus: 'ACTIVE',
      connectedAt: '2026-11-04T10:00:00.000Z',
      disconnectedAt: null,
      lastSyncedAt: null,
    });
    expect(body).not.toHaveProperty('slug');
    expect(body.repository).not.toHaveProperty('installationId');
    expect(body.repository).not.toHaveProperty('accessToken');
    expect(body.repository).not.toHaveProperty('token');
  });

  it('represents a defensive missing repository as null on retrieval', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      { repository: false },
    );

    const response = await getProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
    ).expect(200);
    const body = response.body as ProjectResponseBody;

    expect(body.repository).toBeNull();
  });

  it('rejects unauthenticated project updates', async () => {
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );

    const response = await updateProject(
      undefined,
      WORKSPACE_UUID,
      PROJECT_UUID,
      { name: 'Updated Project' },
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
  });

  it.each([
    ['not-a-uuid', PROJECT_UUID],
    [WORKSPACE_UUID, 'not-a-uuid'],
  ])(
    'rejects invalid project update UUIDs: %s %s',
    async (workspaceId, projectId) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, 'OWNER');

      await updateProject(
        token,
        workspaceId,
        projectId,
        { name: 'Updated Project' },
      ).expect(400);
    },
  );

  it('returns 404 for a nonexistent workspace when updating a project', async () => {
    const { token } = createAuthenticatedUser();

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      { name: 'Updated Project' },
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
  });

  it('returns 404 for a non-member without updating the project', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-2', WORKSPACE_UUID, 'OWNER');
    const project = addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      { name: 'Checkout API' },
    );

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      { name: 'Updated Project' },
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(project.name).toBe('Checkout API');
  });

  it.each(['MEMBER', 'VIEWER'] as const)(
    'forbids a %s from updating a project',
    async (role) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, role);
      const project = addProject(
        PROJECT_UUID,
        WORKSPACE_UUID,
        '2026-11-04T10:00:00.000Z',
        { name: 'Checkout API' },
      );

      const response = await updateProject(
        token,
        WORKSPACE_UUID,
        PROJECT_UUID,
        { name: 'Updated Project' },
      ).expect(403);

      expect((response.body as ErrorResponseBody).message).toBe(
        PROJECT_UPDATE_FORBIDDEN_MESSAGE,
      );
      expect(project.name).toBe('Checkout API');
    },
  );

  it('updates project fields for an owner without changing the repository', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      {
        name: 'Checkout API',
        githubId: REPOSITORY_GITHUB_ID,
      },
    );
    const repository = repositories.find(
      (candidate) => candidate.projectId === PROJECT_UUID,
    );

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      {
        name: 'Updated Project',
        description: 'Updated description',
      },
    ).expect(200);
    const body = response.body as ProjectResponseBody;

    expect(body).toMatchObject({
      id: PROJECT_UUID,
      workspaceId: WORKSPACE_UUID,
      name: 'Updated Project',
      description: 'Updated description',
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: PROJECT_UPDATED_AT.toISOString(),
    });
    expect(body.repository).toMatchObject({
      id: `repository-${PROJECT_UUID}`,
      githubId: REPOSITORY_GITHUB_ID.toString(),
      fullName: `acme/${PROJECT_UUID}`,
    });
    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'repository',
      'updatedAt',
      'workspaceId',
    ]);
    expect(body).not.toHaveProperty('slug');
    expect(body.repository).not.toHaveProperty('installationId');
    expect(
      projects.find((candidate) => candidate.id === PROJECT_UUID),
    ).toMatchObject({
      id: PROJECT_UUID,
      workspaceId: WORKSPACE_UUID,
      name: 'Updated Project',
      description: 'Updated description',
    });
    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toBe(repository);
    expect(repository).toMatchObject({
      projectId: PROJECT_UUID,
      workspaceId: WORKSPACE_UUID,
      githubId: REPOSITORY_GITHUB_ID,
    });
  });

  it('allows an admin to update only the project name', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'ADMIN');
    const project = addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      { name: 'Checkout API' },
    );
    project.description = 'Existing description';

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      { name: 'Renamed Project' },
    ).expect(200);
    const body = response.body as ProjectResponseBody;

    expect(body.name).toBe('Renamed Project');
    expect(body.description).toBe('Existing description');
  });

  it('updates only the project description', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      { name: 'Checkout API' },
    );

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      { description: 'New description' },
    ).expect(200);
    const body = response.body as ProjectResponseBody;

    expect(body.name).toBe('Checkout API');
    expect(body.description).toBe('New description');
  });

  it('clears the project description when null is supplied', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    const project = addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
    );
    project.description = 'Existing description';

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      { description: null },
    ).expect(200);
    const body = response.body as ProjectResponseBody;

    expect(body.description).toBeNull();
    expect(
      projects.find((candidate) => candidate.id === PROJECT_UUID)
        ?.description,
    ).toBeNull();
  });

  it('returns 404 when updating a project that does not exist', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      { name: 'Updated Project' },
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_NOT_FOUND_MESSAGE,
    );
    expect(projects).toHaveLength(0);
  });

  it('returns 404 when updating a project from another workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    const project = addProject(
      OTHER_PROJECT_UUID,
      OTHER_WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      { name: 'Other Project' },
    );

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      OTHER_PROJECT_UUID,
      { name: 'Updated Project' },
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_NOT_FOUND_MESSAGE,
    );
    expect(project.name).toBe('Other Project');
  });

  it('rejects an empty update body', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_UUID, 'OWNER');
    const project = addProject(
      PROJECT_UUID,
      WORKSPACE_UUID,
      '2026-11-04T10:00:00.000Z',
      { name: 'Checkout API' },
    );

    const response = await updateProject(
      token,
      WORKSPACE_UUID,
      PROJECT_UUID,
      {},
    ).expect(400);

    expect((response.body as ErrorResponseBody).message).toBe(
      PROJECT_UPDATE_EMPTY_MESSAGE,
    );
    expect(project.name).toBe('Checkout API');
  });

  it.each([
    [{ name: 'Updated Project', repositoryGithubId: '123456789' }],
    [{ name: 'Updated Project', repositoryId: 'repository-1' }],
    [{ name: 'Updated Project', workspaceId: OTHER_WORKSPACE_UUID }],
    [{ name: 'Updated Project', projectId: OTHER_PROJECT_UUID }],
    [{ name: 'Updated Project', userId: 'user-2' }],
    [{ name: 'Updated Project', role: 'OWNER' }],
    [{ name: 'Updated Project', slug: 'updated-project' }],
    [{ name: 'Updated Project', status: 'ARCHIVED' }],
    [{ name: 'Updated Project', createdAt: '2026-11-04T10:00:00.000Z' }],
    [{ name: 'Updated Project', updatedAt: '2026-11-04T10:00:00.000Z' }],
  ])(
    'rejects immutable or unknown project update fields: %j',
    async (body) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, 'OWNER');
      const project = addProject(
        PROJECT_UUID,
        WORKSPACE_UUID,
        '2026-11-04T10:00:00.000Z',
        { name: 'Checkout API' },
      );

      await updateProject(
        token,
        WORKSPACE_UUID,
        PROJECT_UUID,
        body,
      ).expect(400);

      expect(project.name).toBe('Checkout API');
    },
  );

  it.each([
    { name: '' },
    { name: '   ' },
    { name: null },
    { name: 42 },
    { name: 'x'.repeat(PROJECT_NAME_MAX_LENGTH + 1) },
    { description: 42 },
    {
      description: 'x'.repeat(
        PROJECT_DESCRIPTION_MAX_LENGTH + 1,
      ),
    },
  ])(
    'rejects invalid project update values: %j',
    async (body) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_UUID, 'OWNER');
      const project = addProject(
        PROJECT_UUID,
        WORKSPACE_UUID,
        '2026-11-04T10:00:00.000Z',
        { name: 'Checkout API' },
      );

      await updateProject(
        token,
        WORKSPACE_UUID,
        PROJECT_UUID,
        body,
      ).expect(400);

      expect(project.name).toBe('Checkout API');
    },
  );

});