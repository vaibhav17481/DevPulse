import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import {
  WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
  WORKSPACE_DELETION_FAILED_MESSAGE,
  WORKSPACE_NOT_FOUND_MESSAGE,
} from './workspace.constants';
import type { WorkspaceRoleName } from './workspace.types';
import { WorkspacesService } from './workspaces.service';

interface FindDeleteMembershipArguments {
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
      arguments_: FindDeleteMembershipArguments,
    ) => Promise<{ role: WorkspaceRoleName } | null>;
  };
  gitHubInstallation: {
    findUnique: (
      arguments_: FindInstallationArguments,
    ) => Promise<{ id: string } | null>;
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
    ) => Promise<{ id: string }>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

function createDeleteManyMock<T>(): jest.MockedFunction<
  (arguments_: T) => Promise<DeleteCount>
> {
  return jest.fn((arguments_: T) => {
    void arguments_;

    return Promise.resolve({ count: 0 });
  });
}

describe('WorkspacesService deletion', () => {
  let service: WorkspacesService;
  let findMembership: jest.MockedFunction<
    (arguments_: FindDeleteMembershipArguments) => Promise<{
      role: WorkspaceRoleName;
    } | null>
  >;
  let findInstallation: jest.MockedFunction<
    (arguments_: FindInstallationArguments) => Promise<{ id: string } | null>
  >;
  let findRepositories: jest.MockedFunction<
    (arguments_: FindRepositoriesArguments) => Promise<Array<{ id: string }>>
  >;
  let deleteWebhookEvents: jest.MockedFunction<
    (arguments_: WebhookEventDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteRecommendations: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteRiskAssessments: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deletePullRequests: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteIssues: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteWorkflowRuns: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteRepositories: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteInstallations: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteProjects: jest.MockedFunction<
    (arguments_: WorkspaceScopedDeleteManyArguments) => Promise<DeleteCount>
  >;
  let deleteWorkspace: jest.MockedFunction<
    (arguments_: WorkspaceDeleteArguments) => Promise<{ id: string }>
  >;
  let transaction: jest.MockedFunction<
    (callback: TransactionCallback) => Promise<unknown>
  >;

  beforeEach(async () => {
    findMembership = jest.fn();
    findInstallation = jest.fn();
    findRepositories = jest.fn();
    deleteWebhookEvents =
      createDeleteManyMock<WebhookEventDeleteManyArguments>();
    deleteRecommendations =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deleteRiskAssessments =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deletePullRequests =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deleteIssues =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deleteWorkflowRuns =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deleteRepositories =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deleteInstallations =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deleteProjects =
      createDeleteManyMock<WorkspaceScopedDeleteManyArguments>();
    deleteWorkspace = jest.fn(
      (arguments_: WorkspaceDeleteArguments) => {
        void arguments_;

        return Promise.resolve({ id: 'workspace-1' });
      },
    );
    transaction = jest.fn((callback) =>
      callback({
        workspaceMember: { findFirst: findMembership },
        gitHubInstallation: {
          findUnique: findInstallation,
          deleteMany: deleteInstallations,
        },
        repository: {
          findMany: findRepositories,
          deleteMany: deleteRepositories,
        },
        webhookEvent: { deleteMany: deleteWebhookEvents },
        recommendation: { deleteMany: deleteRecommendations },
        riskAssessment: { deleteMany: deleteRiskAssessments },
        pullRequest: { deleteMany: deletePullRequests },
        issue: { deleteMany: deleteIssues },
        workflowRun: { deleteMany: deleteWorkflowRuns },
        project: { deleteMany: deleteProjects },
        workspace: { delete: deleteWorkspace },
      }),
    );

    const database = {
      client: { $transaction: transaction },
    } as unknown as DatabaseService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    service = module.get(WorkspacesService);
  });

  it('deletes all workspace-owned records and the workspace for an owner', async () => {
    findMembership.mockResolvedValue({ role: 'OWNER' });
    findInstallation.mockResolvedValue({ id: 'installation-1' });
    findRepositories.mockResolvedValue([
      { id: 'repository-1' },
      { id: 'repository-2' },
    ]);

    await expect(
      service.delete('user-1', 'workspace-1'),
    ).resolves.toBeUndefined();

    expect(findMembership).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: 'workspace-1' },
      select: { role: true },
    });
    expect(findInstallation).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(findRepositories).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(deleteWebhookEvents).toHaveBeenCalledWith({
      where: {
        OR: [
          { workspaceId: 'workspace-1' },
          { installationId: 'installation-1' },
          { repositoryId: { in: ['repository-1', 'repository-2'] } },
        ],
      },
    });

    for (const deletion of [
      deleteRecommendations,
      deleteRiskAssessments,
      deletePullRequests,
      deleteIssues,
      deleteWorkflowRuns,
      deleteRepositories,
      deleteInstallations,
      deleteProjects,
    ]) {
      expect(deletion).toHaveBeenCalledWith({
        where: { workspaceId: 'workspace-1' },
      });
    }

    expect(deleteWorkspace).toHaveBeenCalledWith({
      where: { id: 'workspace-1' },
    });

    const deletionOrder = [
      deleteWebhookEvents,
      deleteRecommendations,
      deleteRiskAssessments,
      deletePullRequests,
      deleteIssues,
      deleteWorkflowRuns,
      deleteRepositories,
      deleteInstallations,
      deleteProjects,
      deleteWorkspace,
    ].map((deletion) => deletion.mock.invocationCallOrder[0] ?? 0);

    expect(deletionOrder).toEqual(
      [...deletionOrder].sort((left, right) => left - right),
    );
  });

  it('deletes only workspace-scoped webhook events when no integration exists', async () => {
    findMembership.mockResolvedValue({ role: 'OWNER' });
    findInstallation.mockResolvedValue(null);
    findRepositories.mockResolvedValue([]);

    await service.delete('user-1', 'workspace-1');

    expect(deleteWebhookEvents).toHaveBeenCalledWith({
      where: { OR: [{ workspaceId: 'workspace-1' }] },
    });
  });

  it('forbids an admin from deleting the workspace', async () => {
    findMembership.mockResolvedValue({ role: 'ADMIN' });

    const deletion = service.delete('user-1', 'workspace-1');

    await expect(deletion).rejects.toThrow(ForbiddenException);
    await expect(deletion).rejects.toThrow(
      WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
    );
    expect(findInstallation).not.toHaveBeenCalled();
    expect(deleteWebhookEvents).not.toHaveBeenCalled();
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });

  it('forbids a member from deleting the workspace', async () => {
    findMembership.mockResolvedValue({ role: 'MEMBER' });

    const deletion = service.delete('user-1', 'workspace-1');

    await expect(deletion).rejects.toThrow(ForbiddenException);
    await expect(deletion).rejects.toThrow(
      WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
    );
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });

  it('returns not found for a non-member', async () => {
    findMembership.mockResolvedValue(null);

    const deletion = service.delete('user-1', 'workspace-1');

    await expect(deletion).rejects.toThrow(NotFoundException);
    await expect(deletion).rejects.toThrow(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findInstallation).not.toHaveBeenCalled();
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });

  it('returns a generic error when a deletion step fails', async () => {
    findMembership.mockResolvedValue({ role: 'OWNER' });
    findInstallation.mockResolvedValue(null);
    findRepositories.mockResolvedValue([]);
    deleteRecommendations.mockRejectedValue(
      new Error('foreign key constraint failed'),
    );

    const deletion = service.delete('user-1', 'workspace-1');

    await expect(deletion).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(deletion).rejects.toThrow(
      WORKSPACE_DELETION_FAILED_MESSAGE,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });
});
