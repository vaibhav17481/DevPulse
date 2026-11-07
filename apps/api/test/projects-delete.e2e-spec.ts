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
  PROJECT_DELETE_FORBIDDEN_MESSAGE,
  PROJECT_DELETION_FAILED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
} from './../src/projects/project.constants';
import type {
  RepositoryConnectionStatusName,
  RepositoryVisibilityName,
} from './../src/projects/project.types';
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
}

interface StoredProject {
  id: string;
  workspaceId: string;
  name: string;
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

interface StoredWebhookEvent {
  id: string;
  workspaceId: string | null;
  installationId: string | null;
  repositoryId: string | null;
}

interface StoredProjectRecord {
  id: string;
  workspaceId: string;
  projectId: string;
}

interface StoredRepositoryRecord {
  id: string;
  workspaceId: string;
  repositoryId: string;
}

interface MembershipFindArguments {
  where: { userId: string; workspaceId: string };
  select: { role: true };
}

interface SessionFindArguments {
  where: {
    tokenHash: string;
    revokedAt: null;
    expiresAt: { gt: Date };
  };
  select: {
    user: { select: { id: true; email: true } };
  };
}

interface ProjectFindArguments {
  where: { id: string; workspaceId: string };
  select: Record<string, unknown>;
}

interface DeleteCount {
  count: number;
}

interface TransactionClient {
  workspaceMember: {
    findFirst: (
      arguments_: MembershipFindArguments,
    ) => Promise<{ role: WorkspaceRoleName } | null>;
  };
  project: {
    findFirst: (
      arguments_: ProjectFindArguments,
    ) => Promise<StoredProject | null>;
    delete: (arguments_: {
      where: { id_workspaceId: { id: string; workspaceId: string } };
    }) => Promise<StoredProject>;
  };
  repository: {
    findFirst: (arguments_: {
      where: { projectId: string; workspaceId: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
    deleteMany: (arguments_: {
      where: { id: string; projectId: string; workspaceId: string };
    }) => Promise<DeleteCount>;
  };
  webhookEvent: {
    deleteMany: (arguments_: {
      where: { repositoryId: string };
    }) => Promise<DeleteCount>;
  };
  recommendation: {
    deleteMany: (arguments_: {
      where: { projectId: string; workspaceId: string };
    }) => Promise<DeleteCount>;
  };
  riskAssessment: {
    deleteMany: (arguments_: {
      where: { projectId: string; workspaceId: string };
    }) => Promise<DeleteCount>;
  };
  pullRequest: {
    deleteMany: (arguments_: {
      where: { repositoryId: string; workspaceId: string };
    }) => Promise<DeleteCount>;
  };
  issue: {
    deleteMany: (arguments_: {
      where: { repositoryId: string; workspaceId: string };
    }) => Promise<DeleteCount>;
  };
  workflowRun: {
    deleteMany: (arguments_: {
      where: { repositoryId: string; workspaceId: string };
    }) => Promise<DeleteCount>;
  };
  gitHubInstallation: {
    deleteMany: (arguments_: {
      where: { workspaceId: string };
    }) => Promise<DeleteCount>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

const WORKSPACE_ID = '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02';
const OTHER_WORKSPACE_ID = '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081';
const PROJECT_ID = '8f0a7c2e-1f9b-4d10-9a2b-3c4d5e6f7081';
const OTHER_PROJECT_ID = '2c3d4e5f-6071-4829-8a3b-4c5d6e7f8092';
const OTHER_WORKSPACE_PROJECT_ID =
  '3d4e5f60-7182-493a-9b4c-5d6e7f809102';
const MISSING_PROJECT_ID = '4e5f6071-8293-4a4b-8c5d-6e7f80910213';
const INSTALLATION_ID = '5f607182-93a4-4b5c-9d6e-7f8091021324';
const OTHER_INSTALLATION_ID = '60718293-a4b5-4c6d-8e7f-809102132435';
const REPOSITORY_ID = '718293a4-b5c6-4d7e-9f80-910213243546';
const OTHER_REPOSITORY_ID = '8293a4b5-c6d7-4e8f-a091-021324354657';
const OTHER_WORKSPACE_REPOSITORY_ID =
  '93a4b5c6-d7e8-4f90-b102-132435465768';
const CREATED_AT = new Date('2026-11-04T10:00:00.000Z');

function databaseError(code: string): Error {
  return Object.assign(new Error(`Database error ${code}`), { code });
}

function clone<T extends object>(values: T[]): T[] {
  return values.map((value) => ({ ...value }));
}

describe('Project deletion (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let sessions: StoredSession[];
  let workspaces: StoredWorkspace[];
  let memberships: StoredMembership[];
  let installations: StoredInstallation[];
  let projects: StoredProject[];
  let repositories: StoredRepository[];
  let webhookEvents: StoredWebhookEvent[];
  let recommendations: StoredProjectRecord[];
  let riskAssessments: StoredProjectRecord[];
  let pullRequests: StoredRepositoryRecord[];
  let issues: StoredRepositoryRecord[];
  let workflowRuns: StoredRepositoryRecord[];
  let failRecommendationDeletion: boolean;
  let findSession: jest.MockedFunction<
    (arguments_: SessionFindArguments) => Promise<{
      user: StoredUser | null;
    } | null>
  >;
  let findMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{
      role: WorkspaceRoleName;
    } | null>
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
    webhookEvents = [];
    recommendations = [];
    riskAssessments = [];
    pullRequests = [];
    issues = [];
    workflowRuns = [];
    failRecommendationDeletion = false;

    findSession = jest.fn((arguments_) => {
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
    transaction = jest.fn(async (callback) => {
      let stateProjects = clone(projects);
      let stateRepositories = clone(repositories);
      let stateWebhookEvents = clone(webhookEvents);
      let stateRecommendations = clone(recommendations);
      let stateRiskAssessments = clone(riskAssessments);
      let statePullRequests = clone(pullRequests);
      let stateIssues = clone(issues);
      let stateWorkflowRuns = clone(workflowRuns);

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
        project: {
          findFirst: (arguments_) => {
            const project = stateProjects.find(
              (candidate) =>
                candidate.id === arguments_.where.id &&
                candidate.workspaceId ===
                  arguments_.where.workspaceId,
            );

            return Promise.resolve(project ?? null);
          },
          delete: (arguments_) => {
            const index = stateProjects.findIndex(
              (candidate) =>
                candidate.id ===
                  arguments_.where.id_workspaceId.id &&
                candidate.workspaceId ===
                  arguments_.where.id_workspaceId.workspaceId,
            );
            const project = stateProjects[index];

            if (!project) {
              return Promise.reject(databaseError('P2025'));
            }

            stateProjects = stateProjects.filter(
              (candidate) => candidate.id !== project.id,
            );

            return Promise.resolve(project);
          },
        },
        repository: {
          findFirst: (arguments_) => {
            const repository = stateRepositories.find(
              (candidate) =>
                candidate.projectId ===
                  arguments_.where.projectId &&
                candidate.workspaceId ===
                  arguments_.where.workspaceId,
            );

            return Promise.resolve(
              repository ? { id: repository.id } : null,
            );
          },
          deleteMany: (arguments_) => {
            const before = stateRepositories.length;

            stateRepositories = stateRepositories.filter(
              (candidate) =>
                !(
                  candidate.id === arguments_.where.id &&
                  candidate.projectId ===
                    arguments_.where.projectId &&
                  candidate.workspaceId ===
                    arguments_.where.workspaceId
                ),
            );

            return Promise.resolve({
              count: before - stateRepositories.length,
            });
          },
        },
        webhookEvent: {
          deleteMany: (arguments_) => {
            const before = stateWebhookEvents.length;

            stateWebhookEvents = stateWebhookEvents.filter(
              (candidate) =>
                candidate.repositoryId !==
                arguments_.where.repositoryId,
            );

            return Promise.resolve({
              count: before - stateWebhookEvents.length,
            });
          },
        },
        recommendation: {
          deleteMany: (arguments_) => {
            if (failRecommendationDeletion) {
              return Promise.reject(
                new Error('recommendation delete failed'),
              );
            }

            const before = stateRecommendations.length;

            stateRecommendations = stateRecommendations.filter(
              (candidate) =>
                !(
                  candidate.projectId ===
                    arguments_.where.projectId &&
                  candidate.workspaceId ===
                    arguments_.where.workspaceId
                ),
            );

            return Promise.resolve({
              count: before - stateRecommendations.length,
            });
          },
        },
        riskAssessment: {
          deleteMany: (arguments_) => {
            const before = stateRiskAssessments.length;

            stateRiskAssessments = stateRiskAssessments.filter(
              (candidate) =>
                !(
                  candidate.projectId ===
                    arguments_.where.projectId &&
                  candidate.workspaceId ===
                    arguments_.where.workspaceId
                ),
            );

            return Promise.resolve({
              count: before - stateRiskAssessments.length,
            });
          },
        },
        pullRequest: {
          deleteMany: (arguments_) => {
            const before = statePullRequests.length;

            statePullRequests = statePullRequests.filter(
              (candidate) =>
                !(
                  candidate.repositoryId ===
                    arguments_.where.repositoryId &&
                  candidate.workspaceId ===
                    arguments_.where.workspaceId
                ),
            );

            return Promise.resolve({
              count: before - statePullRequests.length,
            });
          },
        },
        issue: {
          deleteMany: (arguments_) => {
            const before = stateIssues.length;

            stateIssues = stateIssues.filter(
              (candidate) =>
                !(
                  candidate.repositoryId ===
                    arguments_.where.repositoryId &&
                  candidate.workspaceId ===
                    arguments_.where.workspaceId
                ),
            );

            return Promise.resolve({
              count: before - stateIssues.length,
            });
          },
        },
        workflowRun: {
          deleteMany: (arguments_) => {
            const before = stateWorkflowRuns.length;

            stateWorkflowRuns = stateWorkflowRuns.filter(
              (candidate) =>
                !(
                  candidate.repositoryId ===
                    arguments_.where.repositoryId &&
                  candidate.workspaceId ===
                    arguments_.where.workspaceId
                ),
            );

            return Promise.resolve({
              count: before - stateWorkflowRuns.length,
            });
          },
        },
        gitHubInstallation: {
          deleteMany: () => Promise.resolve({ count: 0 }),
        },
      };

      const result = await callback(transactionClient);

      projects = stateProjects;
      repositories = stateRepositories;
      webhookEvents = stateWebhookEvents;
      recommendations = stateRecommendations;
      riskAssessments = stateRiskAssessments;
      pullRequests = statePullRequests;
      issues = stateIssues;
      workflowRuns = stateWorkflowRuns;

      return result;
    });

    const database = {
      client: {
        session: { findUnique: findSession },
        workspaceMember: { findFirst: findMembership },
        project: {
          findFirst: (arguments_: ProjectFindArguments) => {
            const project = projects.find(
              (candidate) =>
                candidate.id === arguments_.where.id &&
                candidate.workspaceId ===
                  arguments_.where.workspaceId,
            );

            if (!project) {
              return Promise.resolve(null);
            }

            return Promise.resolve({
              ...project,
              description: null,
              repository:
                repositories.find(
                  (repository) =>
                    repository.projectId === project.id,
                ) ?? null,
              createdAt: CREATED_AT,
              updatedAt: CREATED_AT,
            });
          },
        },
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

  function createAuthenticatedUser(): { token: string } {
    users.set('user-1', {
      id: 'user-1',
      email: 'user@example.com',
    });

    const token = generateSessionToken();

    sessions.push({
      id: 'session-1',
      userId: 'user-1',
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      revokedAt: null,
    });

    return { token };
  }

  function addWorkspace(
    id = WORKSPACE_ID,
    name = 'Platform Engineering',
  ): void {
    workspaces.push({ id, name });
  }

  function addMembership(
    userId: string,
    workspaceId: string,
    role: WorkspaceRoleName,
  ): void {
    memberships.push({
      id: `membership-${memberships.length + 1}`,
      workspaceId,
      userId,
      role,
    });
  }

  function addInstallation(
    id = INSTALLATION_ID,
    workspaceId = WORKSPACE_ID,
  ): void {
    installations.push({ id, workspaceId });
  }

  function addProject(
    id: string,
    workspaceId: string,
    repositoryId: string,
    installationId = INSTALLATION_ID,
  ): void {
    projects.push({
      id,
      workspaceId,
      name: `Project ${id}`,
    });
    repositories.push({
      id: repositoryId,
      workspaceId,
      projectId: id,
      installationId,
      githubId: 1000n + BigInt(repositories.length + 1),
      ownerLogin: 'acme',
      name: `repository-${id}`,
      fullName: `acme/repository-${id}`,
      defaultBranch: 'main',
      visibility: 'PRIVATE',
      isArchived: false,
      connectionStatus: 'ACTIVE',
      connectedAt: CREATED_AT,
      disconnectedAt: null,
      lastSyncedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  }

  function addProjectWithoutRepository(
    id: string,
    workspaceId: string,
  ): void {
    projects.push({
      id,
      workspaceId,
      name: `Project ${id}`,
    });
  }

  function addRelatedRecords(
    projectId: string,
    workspaceId: string,
    repositoryId: string,
  ): void {
    recommendations.push({
      id: `recommendation-${projectId}`,
      workspaceId,
      projectId,
    });
    riskAssessments.push({
      id: `risk-${projectId}`,
      workspaceId,
      projectId,
    });
    pullRequests.push({
      id: `pull-request-${repositoryId}`,
      workspaceId,
      repositoryId,
    });
    issues.push({
      id: `issue-${repositoryId}`,
      workspaceId,
      repositoryId,
    });
    workflowRuns.push({
      id: `workflow-run-${repositoryId}`,
      workspaceId,
      repositoryId,
    });
    webhookEvents.push({
      id: `webhook-${repositoryId}`,
      workspaceId,
      installationId: INSTALLATION_ID,
      repositoryId,
    });
  }

  function deleteProject(
    token: string | undefined,
    workspaceId: string,
    projectId: string,
  ): request.Test {
    const test = request(app.getHttpServer()).delete(
      `/workspaces/${workspaceId}/projects/${projectId}`,
    );

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  it('rejects unauthenticated project deletion', async () => {
    const response = await deleteProject(
      undefined,
      WORKSPACE_ID,
      PROJECT_ID,
    ).expect(401);

    expect((response.body as { message: string }).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
  });

  it.each([
    ['not-a-uuid', PROJECT_ID],
    [WORKSPACE_ID, 'not-a-uuid'],
  ])(
    'rejects invalid deletion UUIDs: %s %s',
    async (workspaceId, projectId) => {
      const { token } = createAuthenticatedUser();

      await deleteProject(token, workspaceId, projectId).expect(400);
    },
  );

  it('returns 404 for a nonexistent workspace', async () => {
    const { token } = createAuthenticatedUser();

    const response = await deleteProject(
      token,
      WORKSPACE_ID,
      PROJECT_ID,
    ).expect(404);

    expect((response.body as { message: string }).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
  });

  it('returns 404 for a non-member without deleting data', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-2', WORKSPACE_ID, 'OWNER');
    addInstallation();
    addProject(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);
    addRelatedRecords(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);

    const response = await deleteProject(
      token,
      WORKSPACE_ID,
      PROJECT_ID,
    ).expect(404);

    expect((response.body as { message: string }).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(projects).toHaveLength(1);
    expect(repositories).toHaveLength(1);
    expect(recommendations).toHaveLength(1);
  });

  it.each(['MEMBER', 'VIEWER'] as const)(
    'forbids a %s from deleting a project',
    async (role) => {
      const { token } = createAuthenticatedUser();
      addWorkspace();
      addMembership('user-1', WORKSPACE_ID, role);
      addInstallation();
      addProject(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);

      const response = await deleteProject(
        token,
        WORKSPACE_ID,
        PROJECT_ID,
      ).expect(403);

      expect((response.body as { message: string }).message).toBe(
        PROJECT_DELETE_FORBIDDEN_MESSAGE,
      );
      expect(projects).toHaveLength(1);
      expect(repositories).toHaveLength(1);
    },
  );

  it('returns 404 when the project does not exist in the workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_ID, 'OWNER');

    const response = await deleteProject(
      token,
      WORKSPACE_ID,
      MISSING_PROJECT_ID,
    ).expect(404);

    expect((response.body as { message: string }).message).toBe(
      PROJECT_NOT_FOUND_MESSAGE,
    );
  });

  it('returns 404 for a project that belongs to another workspace without deleting it', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addWorkspace(OTHER_WORKSPACE_ID, 'Other Workspace');
    addMembership('user-1', WORKSPACE_ID, 'OWNER');
    addMembership('user-1', OTHER_WORKSPACE_ID, 'OWNER');
    addInstallation(OTHER_INSTALLATION_ID, OTHER_WORKSPACE_ID);
    addProject(
      OTHER_WORKSPACE_PROJECT_ID,
      OTHER_WORKSPACE_ID,
      OTHER_WORKSPACE_REPOSITORY_ID,
      OTHER_INSTALLATION_ID,
    );

    const response = await deleteProject(
      token,
      WORKSPACE_ID,
      OTHER_WORKSPACE_PROJECT_ID,
    ).expect(404);

    expect((response.body as { message: string }).message).toBe(
      PROJECT_NOT_FOUND_MESSAGE,
    );
    expect(projects).toHaveLength(1);
    expect(repositories).toHaveLength(1);
  });

  it('allows an admin to delete a project', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_ID, 'ADMIN');
    addInstallation();
    addProject(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);

    await deleteProject(token, WORKSPACE_ID, PROJECT_ID).expect(204);

    expect(projects).toHaveLength(0);
    expect(repositories).toHaveLength(0);
  });

  it('deletes only the target project aggregate for an owner and returns no body', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addWorkspace(OTHER_WORKSPACE_ID, 'Other Workspace');
    addMembership('user-1', WORKSPACE_ID, 'OWNER');
    addMembership('user-1', OTHER_WORKSPACE_ID, 'OWNER');
    addInstallation(INSTALLATION_ID, WORKSPACE_ID);
    addInstallation(OTHER_INSTALLATION_ID, OTHER_WORKSPACE_ID);
    addProject(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);
    addProject(OTHER_PROJECT_ID, WORKSPACE_ID, OTHER_REPOSITORY_ID);
    addProject(
      OTHER_WORKSPACE_PROJECT_ID,
      OTHER_WORKSPACE_ID,
      OTHER_WORKSPACE_REPOSITORY_ID,
      OTHER_INSTALLATION_ID,
    );
    addRelatedRecords(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);
    addRelatedRecords(
      OTHER_PROJECT_ID,
      WORKSPACE_ID,
      OTHER_REPOSITORY_ID,
    );
    addRelatedRecords(
      OTHER_WORKSPACE_PROJECT_ID,
      OTHER_WORKSPACE_ID,
      OTHER_WORKSPACE_REPOSITORY_ID,
    );
    webhookEvents.push({
      id: 'workspace-level-webhook',
      workspaceId: WORKSPACE_ID,
      installationId: INSTALLATION_ID,
      repositoryId: null,
    });

    const response = await deleteProject(
      token,
      WORKSPACE_ID,
      PROJECT_ID,
    ).expect(204);

    expect(response.text).toBe('');
    expect(projects.map((project) => project.id).sort()).toEqual([
      OTHER_PROJECT_ID,
      OTHER_WORKSPACE_PROJECT_ID,
    ]);
    expect(
      repositories.map((repository) => repository.id).sort(),
    ).toEqual([
      OTHER_REPOSITORY_ID,
      OTHER_WORKSPACE_REPOSITORY_ID,
    ]);
    expect(
      webhookEvents.map((event) => event.id).sort(),
    ).toEqual([
      `webhook-${OTHER_REPOSITORY_ID}`,
      `webhook-${OTHER_WORKSPACE_REPOSITORY_ID}`,
      'workspace-level-webhook',
    ]);
    expect(
      recommendations.map((recommendation) => recommendation.projectId),
    ).not.toContain(PROJECT_ID);
    expect(
      riskAssessments.map((assessment) => assessment.projectId),
    ).not.toContain(PROJECT_ID);
    expect(
      pullRequests.map((pullRequest) => pullRequest.repositoryId),
    ).not.toContain(REPOSITORY_ID);
    expect(
      issues.map((issue) => issue.repositoryId),
    ).not.toContain(REPOSITORY_ID);
    expect(
      workflowRuns.map((workflowRun) => workflowRun.repositoryId),
    ).not.toContain(REPOSITORY_ID);
    expect(
      recommendations.some(
        (recommendation) =>
          recommendation.projectId === OTHER_PROJECT_ID,
      ),
    ).toBe(true);
    expect(
      pullRequests.some(
        (pullRequest) =>
          pullRequest.repositoryId === OTHER_REPOSITORY_ID,
      ),
    ).toBe(true);
    expect(
      installations.map((installation) => installation.id).sort(),
    ).toEqual([INSTALLATION_ID, OTHER_INSTALLATION_ID]);
    expect(workspaces).toHaveLength(2);
    expect(memberships).toHaveLength(2);
    expect(users.size).toBe(1);
    expect(sessions).toHaveLength(1);

    await deleteProject(token, WORKSPACE_ID, PROJECT_ID).expect(404);
  });

  it('deletes a legacy project without a repository and preserves unattributed webhook events', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_ID, 'OWNER');
    addInstallation();
    addProjectWithoutRepository(PROJECT_ID, WORKSPACE_ID);
    recommendations.push({
      id: 'recommendation-1',
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    });
    riskAssessments.push({
      id: 'risk-1',
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    });
    webhookEvents.push({
      id: 'workspace-level-webhook',
      workspaceId: WORKSPACE_ID,
      installationId: INSTALLATION_ID,
      repositoryId: null,
    });

    await deleteProject(token, WORKSPACE_ID, PROJECT_ID).expect(204);

    expect(projects).toHaveLength(0);
    expect(recommendations).toHaveLength(0);
    expect(riskAssessments).toHaveLength(0);
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0]?.id).toBe('workspace-level-webhook');
    expect(installations).toHaveLength(1);
  });

  it('rolls back the deletion when a step fails', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace();
    addMembership('user-1', WORKSPACE_ID, 'OWNER');
    addInstallation();
    addProject(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);
    addRelatedRecords(PROJECT_ID, WORKSPACE_ID, REPOSITORY_ID);
    failRecommendationDeletion = true;

    const response = await deleteProject(
      token,
      WORKSPACE_ID,
      PROJECT_ID,
    ).expect(500);

    expect((response.body as { message: string }).message).toBe(
      PROJECT_DELETION_FAILED_MESSAGE,
    );
    expect(projects).toHaveLength(1);
    expect(repositories).toHaveLength(1);
    expect(recommendations).toHaveLength(1);
    expect(webhookEvents).toHaveLength(1);
  });
});
