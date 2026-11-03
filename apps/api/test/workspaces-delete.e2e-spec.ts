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
  WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
  WORKSPACE_DELETION_FAILED_MESSAGE,
  WORKSPACE_NOT_FOUND_MESSAGE,
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

interface StoredInvitation {
  id: string;
  workspaceId: string;
}

interface StoredProject {
  id: string;
  workspaceId: string;
}

interface StoredInstallation {
  id: string;
  workspaceId: string;
}

interface StoredRepository {
  id: string;
  workspaceId: string;
}

interface StoredWebhookEvent {
  id: string;
  workspaceId: string | null;
  installationId: string | null;
  repositoryId: string | null;
}

interface StoredRiskAssessment {
  id: string;
  workspaceId: string;
  projectId: string;
}

interface StoredRecommendation {
  id: string;
  workspaceId: string;
  projectId: string;
}

interface StoredPullRequest {
  id: string;
  workspaceId: string;
  repositoryId: string;
}

interface StoredIssue {
  id: string;
  workspaceId: string;
  repositoryId: string;
}

interface StoredWorkflowRun {
  id: string;
  workspaceId: string;
  repositoryId: string;
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

interface GetMembershipArguments {
  where: { userId: string; workspaceId: string };
}

interface DeleteMembershipArguments {
  where: { userId: string; workspaceId: string };
  select: { role: true };
}

interface FindInstallationArguments {
  where: { workspaceId: string };
  select: { id: true };
}

interface FindRepositoriesArguments {
  where: { workspaceId: string };
  select: { id: true };
}

interface WorkspaceScopedDeleteManyArguments {
  where: { workspaceId: string };
}

interface WebhookEventDeleteManyArguments {
  where: {
    OR: Array<
      | { workspaceId: string }
      | { installationId: string }
      | { repositoryId: { in: string[] } }
    >;
  };
}

interface WorkspaceDeleteArguments {
  where: { id: string };
}

interface DeleteCount {
  count: number;
}

interface TransactionClient {
  workspaceMember: {
    findFirst: (
      arguments_: DeleteMembershipArguments,
    ) => Promise<{ role: WorkspaceRoleName } | null>;
  };
  gitHubInstallation: {
    findUnique: (
      arguments_: FindInstallationArguments,
    ) => Promise<StoredInstallation | null>;
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  repository: {
    findMany: (
      arguments_: FindRepositoriesArguments,
    ) => Promise<Array<{ id: string }>>;
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  webhookEvent: {
    deleteMany: (
      arguments_: WebhookEventDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  recommendation: {
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  riskAssessment: {
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  pullRequest: {
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  issue: {
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  workflowRun: {
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  project: {
    deleteMany: (
      arguments_: WorkspaceScopedDeleteManyArguments,
    ) => Promise<DeleteCount>;
  };
  workspace: {
    delete: (
      arguments_: WorkspaceDeleteArguments,
    ) => Promise<StoredWorkspace>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

interface DeletionState {
  workspaces: StoredWorkspace[];
  memberships: StoredMembership[];
  invitations: StoredInvitation[];
  projects: StoredProject[];
  installations: StoredInstallation[];
  repositories: StoredRepository[];
  webhookEvents: StoredWebhookEvent[];
  riskAssessments: StoredRiskAssessment[];
  recommendations: StoredRecommendation[];
  pullRequests: StoredPullRequest[];
  issues: StoredIssue[];
  workflowRuns: StoredWorkflowRun[];
}

interface ErrorResponseBody {
  message: string;
}

const TARGET_WORKSPACE_UUID = '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02';
const OTHER_WORKSPACE_UUID = '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081';

function removeWorkspaceRecords<T extends { workspaceId: string }>(
  records: T[],
  workspaceId: string,
): number {
  const remaining = records.filter(
    (record) => record.workspaceId !== workspaceId,
  );
  const removed = records.length - remaining.length;

  records.splice(0, records.length, ...remaining);

  return removed;
}

describe('Workspaces deletion (e2e)', () => {
  let app: INestApplication<App>;
  let users: Map<string, StoredUser>;
  let sessions: StoredSession[];
  let workspaces: StoredWorkspace[];
  let memberships: StoredMembership[];
  let invitations: StoredInvitation[];
  let projects: StoredProject[];
  let installations: StoredInstallation[];
  let repositories: StoredRepository[];
  let webhookEvents: StoredWebhookEvent[];
  let riskAssessments: StoredRiskAssessment[];
  let recommendations: StoredRecommendation[];
  let pullRequests: StoredPullRequest[];
  let issues: StoredIssue[];
  let workflowRuns: StoredWorkflowRun[];
  let failProjectDeletion: boolean;
  let findUnique: jest.MockedFunction<
    (arguments_: SessionFindUniqueArguments) => Promise<FoundSession | null>
  >;
  let findMembership: jest.MockedFunction<
    (arguments_: GetMembershipArguments) => Promise<{
      role: WorkspaceRoleName;
      workspace: StoredWorkspace;
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
    invitations = [];
    projects = [];
    installations = [];
    repositories = [];
    webhookEvents = [];
    riskAssessments = [];
    recommendations = [];
    pullRequests = [];
    issues = [];
    workflowRuns = [];
    failProjectDeletion = false;

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

      if (!membership) {
        return Promise.resolve(null);
      }

      const workspace = workspaces.find(
        (candidate) => candidate.id === membership.workspaceId,
      );

      return Promise.resolve(
        workspace ? { role: membership.role, workspace } : null,
      );
    });
    transaction = jest.fn(async (callback) => {
      const state: DeletionState = {
        workspaces: [...workspaces],
        memberships: [...memberships],
        invitations: [...invitations],
        projects: [...projects],
        installations: [...installations],
        repositories: [...repositories],
        webhookEvents: [...webhookEvents],
        riskAssessments: [...riskAssessments],
        recommendations: [...recommendations],
        pullRequests: [...pullRequests],
        issues: [...issues],
        workflowRuns: [...workflowRuns],
      };

      const transactionClient: TransactionClient = {
        workspaceMember: {
          findFirst: (arguments_) => {
            const membership = state.memberships.find(
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
        gitHubInstallation: {
          findUnique: (arguments_) => {
            const installation = state.installations.find(
              (candidate) =>
                candidate.workspaceId === arguments_.where.workspaceId,
            );

            return Promise.resolve(installation ?? null);
          },
          deleteMany: (arguments_) =>
            Promise.resolve({
              count: removeWorkspaceRecords(
                state.installations,
                arguments_.where.workspaceId,
              ),
            }),
        },
        repository: {
          findMany: (arguments_) =>
            Promise.resolve(
              state.repositories
                .filter(
                  (repository) =>
                    repository.workspaceId ===
                    arguments_.where.workspaceId,
                )
                .map((repository) => ({ id: repository.id })),
            ),
          deleteMany: (arguments_) =>
            Promise.resolve({
              count: removeWorkspaceRecords(
                state.repositories,
                arguments_.where.workspaceId,
              ),
            }),
        },
        webhookEvent: {
          deleteMany: (arguments_) => {
            const remaining = state.webhookEvents.filter((event) => {
              const matchesWorkspace = arguments_.where.OR.some(
                (filter) => {
                  if ('workspaceId' in filter) {
                    return event.workspaceId === filter.workspaceId;
                  }

                  if ('installationId' in filter) {
                    return event.installationId === filter.installationId;
                  }

                  return (
                    event.repositoryId !== null &&
                    filter.repositoryId.in.includes(event.repositoryId)
                  );
                },
              );

              return !matchesWorkspace;
            });
            const removed =
              state.webhookEvents.length - remaining.length;

            state.webhookEvents.splice(
              0,
              state.webhookEvents.length,
              ...remaining,
            );

            return Promise.resolve({ count: removed });
          },
        },
        recommendation: {
          deleteMany: (arguments_) =>
            Promise.resolve({
              count: removeWorkspaceRecords(
                state.recommendations,
                arguments_.where.workspaceId,
              ),
            }),
        },
        riskAssessment: {
          deleteMany: (arguments_) =>
            Promise.resolve({
              count: removeWorkspaceRecords(
                state.riskAssessments,
                arguments_.where.workspaceId,
              ),
            }),
        },
        pullRequest: {
          deleteMany: (arguments_) =>
            Promise.resolve({
              count: removeWorkspaceRecords(
                state.pullRequests,
                arguments_.where.workspaceId,
              ),
            }),
        },
        issue: {
          deleteMany: (arguments_) =>
            Promise.resolve({
              count: removeWorkspaceRecords(
                state.issues,
                arguments_.where.workspaceId,
              ),
            }),
        },
        workflowRun: {
          deleteMany: (arguments_) =>
            Promise.resolve({
              count: removeWorkspaceRecords(
                state.workflowRuns,
                arguments_.where.workspaceId,
              ),
            }),
        },
        project: {
          deleteMany: (arguments_) => {
            if (failProjectDeletion) {
              return Promise.reject(
                new Error('foreign key constraint failed'),
              );
            }

            return Promise.resolve({
              count: removeWorkspaceRecords(
                state.projects,
                arguments_.where.workspaceId,
              ),
            });
          },
        },
        workspace: {
          delete: (arguments_) => {
            const index = state.workspaces.findIndex(
              (workspace) => workspace.id === arguments_.where.id,
            );
            const workspace = state.workspaces[index];

            if (!workspace) {
              return Promise.reject(new Error('workspace not found'));
            }

            state.workspaces.splice(index, 1);
            removeWorkspaceRecords(
              state.memberships,
              arguments_.where.id,
            );
            removeWorkspaceRecords(
              state.invitations,
              arguments_.where.id,
            );

            return Promise.resolve(workspace);
          },
        },
      };

      const result = await callback(transactionClient);

      workspaces = state.workspaces;
      memberships = state.memberships;
      invitations = state.invitations;
      projects = state.projects;
      installations = state.installations;
      repositories = state.repositories;
      webhookEvents = state.webhookEvents;
      riskAssessments = state.riskAssessments;
      recommendations = state.recommendations;
      pullRequests = state.pullRequests;
      issues = state.issues;
      workflowRuns = state.workflowRuns;

      return result;
    });

    const database = {
      client: {
        session: { findUnique },
        workspaceMember: { findFirst: findMembership },
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
    name = 'Project Workspace',
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

  function addWorkspaceGraph(workspaceId: string): void {
    const suffix = workspaces.length;
    const project: StoredProject = {
      id: `project-${suffix}`,
      workspaceId,
    };
    const installation: StoredInstallation = {
      id: `installation-${suffix}`,
      workspaceId,
    };
    const repository: StoredRepository = {
      id: `repository-${suffix}`,
      workspaceId,
    };

    projects.push(project);
    installations.push(installation);
    repositories.push(repository);
    invitations.push({
      id: `invitation-${suffix}`,
      workspaceId,
    });
    webhookEvents.push(
      {
        id: `webhook-workspace-${suffix}`,
        workspaceId,
        installationId: null,
        repositoryId: null,
      },
      {
        id: `webhook-integration-${suffix}`,
        workspaceId,
        installationId: installation.id,
        repositoryId: repository.id,
      },
    );
    pullRequests.push({
      id: `pull-request-${suffix}`,
      workspaceId,
      repositoryId: repository.id,
    });
    issues.push({
      id: `issue-${suffix}`,
      workspaceId,
      repositoryId: repository.id,
    });
    workflowRuns.push({
      id: `workflow-run-${suffix}`,
      workspaceId,
      repositoryId: repository.id,
    });
    const riskAssessment: StoredRiskAssessment = {
      id: `risk-assessment-${suffix}`,
      workspaceId,
      projectId: project.id,
    };

    riskAssessments.push(riskAssessment);
    recommendations.push({
      id: `recommendation-${suffix}`,
      workspaceId,
      projectId: project.id,
    });
  }

  function createAuthenticatedUser(): { token: string } {
    const token = generateSessionToken();
    addUser();
    addSession('user-1', token);

    return { token };
  }

  function deleteWorkspace(
    token: string | undefined,
    id: string,
  ): request.Test {
    const test = request(app.getHttpServer()).delete(
      `/workspaces/${id}`,
    );

    return token
      ? test.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`)
      : test;
  }

  function getWorkspace(token: string, id: string): request.Test {
    return request(app.getHttpServer())
      .get(`/workspaces/${id}`)
      .set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
  }

  it('rejects unauthenticated deletion', async () => {
    addWorkspace(TARGET_WORKSPACE_UUID);
    addMembership('user-1', TARGET_WORKSPACE_UUID, 'OWNER');

    const response = await deleteWorkspace(
      undefined,
      TARGET_WORKSPACE_UUID,
    ).expect(401);

    expect((response.body as ErrorResponseBody).message).toBe(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(workspaces).toHaveLength(1);
  });

  it('allows an owner to permanently delete a workspace and its records', async () => {
    const { token } = createAuthenticatedUser();
    addUser('user-2', 'other@example.com');
    addWorkspace(TARGET_WORKSPACE_UUID);
    addWorkspace(OTHER_WORKSPACE_UUID, 'Other Workspace');
    addMembership('user-1', TARGET_WORKSPACE_UUID, 'OWNER');
    addMembership('user-2', OTHER_WORKSPACE_UUID, 'OWNER');
    addMembership('user-1', OTHER_WORKSPACE_UUID, 'MEMBER');
    addWorkspaceGraph(TARGET_WORKSPACE_UUID);
    addWorkspaceGraph(OTHER_WORKSPACE_UUID);

    const response = await deleteWorkspace(
      token,
      TARGET_WORKSPACE_UUID,
    ).expect(204);

    expect(response.text).toBe('');
    expect(workspaces.map((workspace) => workspace.id)).toEqual([
      OTHER_WORKSPACE_UUID,
    ]);
    expect(
      memberships.map((membership) => [
        membership.userId,
        membership.workspaceId,
      ]),
    ).toEqual([
      ['user-2', OTHER_WORKSPACE_UUID],
      ['user-1', OTHER_WORKSPACE_UUID],
    ]);
    expect(
      invitations.every(
        (invitation) =>
          invitation.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      projects.every(
        (project) => project.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      installations.every(
        (installation) =>
          installation.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      repositories.every(
        (repository) =>
          repository.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      webhookEvents.every(
        (event) => event.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      riskAssessments.every(
        (assessment) =>
          assessment.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      recommendations.every(
        (recommendation) =>
          recommendation.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      pullRequests.every(
        (pullRequest) =>
          pullRequest.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      issues.every(
        (issue) => issue.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(
      workflowRuns.every(
        (workflowRun) =>
          workflowRun.workspaceId === OTHER_WORKSPACE_UUID,
      ),
    ).toBe(true);
    expect(users.has('user-1')).toBe(true);
    expect(users.has('user-2')).toBe(true);
    expect(sessions).toHaveLength(1);

    await getWorkspace(token, TARGET_WORKSPACE_UUID).expect(404);
  });

  it('forbids an admin from deleting the workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(TARGET_WORKSPACE_UUID);
    addMembership('user-1', TARGET_WORKSPACE_UUID, 'ADMIN');
    addWorkspaceGraph(TARGET_WORKSPACE_UUID);

    const response = await deleteWorkspace(
      token,
      TARGET_WORKSPACE_UUID,
    ).expect(403);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
    );
    expect(workspaces).toHaveLength(1);
    expect(projects).toHaveLength(1);
    expect(recommendations).toHaveLength(1);
    expect(webhookEvents).toHaveLength(2);
  });

  it('forbids a member from deleting the workspace', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(TARGET_WORKSPACE_UUID);
    addMembership('user-1', TARGET_WORKSPACE_UUID, 'MEMBER');

    const response = await deleteWorkspace(
      token,
      TARGET_WORKSPACE_UUID,
    ).expect(403);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
    );
    expect(workspaces).toHaveLength(1);
  });

  it('returns 404 for a non-member', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(TARGET_WORKSPACE_UUID);
    addMembership('user-2', TARGET_WORKSPACE_UUID, 'OWNER');

    const response = await deleteWorkspace(
      token,
      TARGET_WORKSPACE_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(workspaces).toHaveLength(1);
  });

  it('returns 404 for a nonexistent workspace', async () => {
    const { token } = createAuthenticatedUser();

    const response = await deleteWorkspace(
      token,
      TARGET_WORKSPACE_UUID,
    ).expect(404);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
  });

  it('returns 400 for an invalid workspace id', async () => {
    const { token } = createAuthenticatedUser();

    await deleteWorkspace(token, 'not-a-uuid').expect(400);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rolls back all deletions when a deletion step fails', async () => {
    const { token } = createAuthenticatedUser();
    addWorkspace(TARGET_WORKSPACE_UUID);
    addMembership('user-1', TARGET_WORKSPACE_UUID, 'OWNER');
    addWorkspaceGraph(TARGET_WORKSPACE_UUID);
    failProjectDeletion = true;

    const response = await deleteWorkspace(
      token,
      TARGET_WORKSPACE_UUID,
    ).expect(500);

    expect((response.body as ErrorResponseBody).message).toBe(
      WORKSPACE_DELETION_FAILED_MESSAGE,
    );
    expect(workspaces).toHaveLength(1);
    expect(memberships).toHaveLength(1);
    expect(invitations).toHaveLength(1);
    expect(projects).toHaveLength(1);
    expect(installations).toHaveLength(1);
    expect(repositories).toHaveLength(1);
    expect(webhookEvents).toHaveLength(2);
    expect(riskAssessments).toHaveLength(1);
    expect(recommendations).toHaveLength(1);
    expect(pullRequests).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(workflowRuns).toHaveLength(1);
  });
});
