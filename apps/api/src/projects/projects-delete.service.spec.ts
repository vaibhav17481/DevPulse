import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { WORKSPACE_NOT_FOUND_MESSAGE } from '../workspaces/workspace.constants';
import type { WorkspaceRoleName } from '../workspaces/workspace.types';
import {
  PROJECT_DELETE_FORBIDDEN_MESSAGE,
  PROJECT_DELETION_FAILED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
} from './project.constants';
import { ProjectsService } from './projects.service';
import { GITHUB_REPOSITORY_RESOLVER } from './repository-resolver';

interface MembershipFindArguments {
  where: { userId: string; workspaceId: string };
  select: { role: true };
}

interface ProjectFindArguments {
  where: { id: string; workspaceId: string };
  select: { id: true };
}

interface RepositoryFindArguments {
  where: { projectId: string; workspaceId: string };
  select: { id: true };
}

interface WebhookEventDeleteArguments {
  where: { repositoryId: string };
}

interface ProjectScopedDeleteArguments {
  where: { projectId: string; workspaceId: string };
}

interface RepositoryActivityDeleteArguments {
  where: { repositoryId: string; workspaceId: string };
}

interface RepositoryDeleteArguments {
  where: {
    id: string;
    projectId: string;
    workspaceId: string;
  };
}

interface ProjectDeleteArguments {
  where: { id_workspaceId: { id: string; workspaceId: string } };
}

interface InstallationDeleteArguments {
  where: { workspaceId: string };
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
    ) => Promise<{ id: string } | null>;
    delete: (
      arguments_: ProjectDeleteArguments,
    ) => Promise<{ id: string }>;
  };
  repository: {
    findFirst: (
      arguments_: RepositoryFindArguments,
    ) => Promise<{ id: string } | null>;
    deleteMany: (
      arguments_: RepositoryDeleteArguments,
    ) => Promise<DeleteCount>;
  };
  gitHubInstallation: {
    deleteMany: (
      arguments_: InstallationDeleteArguments,
    ) => Promise<DeleteCount>;
  };
  webhookEvent: {
    deleteMany: (
      arguments_: WebhookEventDeleteArguments,
    ) => Promise<DeleteCount>;
  };
  recommendation: {
    deleteMany: (
      arguments_: ProjectScopedDeleteArguments,
    ) => Promise<DeleteCount>;
  };
  riskAssessment: {
    deleteMany: (
      arguments_: ProjectScopedDeleteArguments,
    ) => Promise<DeleteCount>;
  };
  pullRequest: {
    deleteMany: (
      arguments_: RepositoryActivityDeleteArguments,
    ) => Promise<DeleteCount>;
  };
  issue: {
    deleteMany: (
      arguments_: RepositoryActivityDeleteArguments,
    ) => Promise<DeleteCount>;
  };
  workflowRun: {
    deleteMany: (
      arguments_: RepositoryActivityDeleteArguments,
    ) => Promise<DeleteCount>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

const WORKSPACE_ID = '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02';
const PROJECT_ID = '8f0a7c2e-1f9b-4d10-9a2b-3c4d5e6f7081';
const REPOSITORY_ID = '6d10a7c2-e1f9-4b4d-8a2b-3c4d5e6f7081';

function databaseError(code: string): Error {
  return Object.assign(new Error(`Database error ${code}`), { code });
}

function createDeleteManyMock<T>(): jest.MockedFunction<
  (arguments_: T) => Promise<DeleteCount>
> {
  return jest.fn((arguments_: T) => {
    void arguments_;

    return Promise.resolve({ count: 0 });
  });
}

describe('ProjectsService deletion', () => {
  let service: ProjectsService;
  let findMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{
      role: WorkspaceRoleName;
    } | null>
  >;
  let findProject: jest.MockedFunction<
    (arguments_: ProjectFindArguments) => Promise<{ id: string } | null>
  >;
  let findRepository: jest.MockedFunction<
    (arguments_: RepositoryFindArguments) => Promise<{ id: string } | null>
  >;
  let deleteWebhookEvents: jest.MockedFunction<
    (arguments_: WebhookEventDeleteArguments) => Promise<DeleteCount>
  >;
  let deleteRecommendations: jest.MockedFunction<
    (arguments_: ProjectScopedDeleteArguments) => Promise<DeleteCount>
  >;
  let deleteRiskAssessments: jest.MockedFunction<
    (arguments_: ProjectScopedDeleteArguments) => Promise<DeleteCount>
  >;
  let deletePullRequests: jest.MockedFunction<
    (arguments_: RepositoryActivityDeleteArguments) => Promise<DeleteCount>
  >;
  let deleteIssues: jest.MockedFunction<
    (arguments_: RepositoryActivityDeleteArguments) => Promise<DeleteCount>
  >;
  let deleteWorkflowRuns: jest.MockedFunction<
    (arguments_: RepositoryActivityDeleteArguments) => Promise<DeleteCount>
  >;
  let deleteRepository: jest.MockedFunction<
    (arguments_: RepositoryDeleteArguments) => Promise<DeleteCount>
  >;
  let deleteProject: jest.MockedFunction<
    (arguments_: ProjectDeleteArguments) => Promise<{ id: string }>
  >;
  let deleteInstallations: jest.MockedFunction<
    (arguments_: InstallationDeleteArguments) => Promise<DeleteCount>
  >;
  let transaction: jest.MockedFunction<
    (callback: TransactionCallback) => Promise<unknown>
  >;

  beforeEach(async () => {
    findMembership = jest.fn();
    findProject = jest.fn();
    findRepository = jest.fn();
    deleteWebhookEvents =
      createDeleteManyMock<WebhookEventDeleteArguments>();
    deleteRecommendations =
      createDeleteManyMock<ProjectScopedDeleteArguments>();
    deleteRiskAssessments =
      createDeleteManyMock<ProjectScopedDeleteArguments>();
    deletePullRequests =
      createDeleteManyMock<RepositoryActivityDeleteArguments>();
    deleteIssues =
      createDeleteManyMock<RepositoryActivityDeleteArguments>();
    deleteWorkflowRuns =
      createDeleteManyMock<RepositoryActivityDeleteArguments>();
    deleteRepository =
      createDeleteManyMock<RepositoryDeleteArguments>();
    deleteInstallations =
      createDeleteManyMock<InstallationDeleteArguments>();
    deleteProject = jest.fn((arguments_) =>
      Promise.resolve({
        id: arguments_.where.id_workspaceId.id,
      }),
    );
    transaction = jest.fn((callback) =>
      callback({
        workspaceMember: { findFirst: findMembership },
        project: {
          findFirst: findProject,
          delete: deleteProject,
        },
        repository: {
          findFirst: findRepository,
          deleteMany: deleteRepository,
        },
        gitHubInstallation: { deleteMany: deleteInstallations },
        webhookEvent: { deleteMany: deleteWebhookEvents },
        recommendation: { deleteMany: deleteRecommendations },
        riskAssessment: { deleteMany: deleteRiskAssessments },
        pullRequest: { deleteMany: deletePullRequests },
        issue: { deleteMany: deleteIssues },
        workflowRun: { deleteMany: deleteWorkflowRuns },
      }),
    );

    const database = {
      client: { $transaction: transaction },
    } as unknown as DatabaseService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DatabaseService, useValue: database },
        {
          provide: GITHUB_REPOSITORY_RESOLVER,
          useValue: { resolve: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ProjectsService);

    findMembership.mockResolvedValue({ role: 'OWNER' });
    findProject.mockResolvedValue({ id: PROJECT_ID });
    findRepository.mockResolvedValue({ id: REPOSITORY_ID });
  });

  it('deletes the project aggregate for an owner without deleting installations', async () => {
    await expect(
      service.delete('user-1', WORKSPACE_ID, PROJECT_ID),
    ).resolves.toBeUndefined();

    expect(findMembership).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: WORKSPACE_ID },
      select: { role: true },
    });
    expect(findProject).toHaveBeenCalledWith({
      where: { id: PROJECT_ID, workspaceId: WORKSPACE_ID },
      select: { id: true },
    });
    expect(findRepository).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, workspaceId: WORKSPACE_ID },
      select: { id: true },
    });
    expect(deleteWebhookEvents).toHaveBeenCalledWith({
      where: { repositoryId: REPOSITORY_ID },
    });
    expect(deleteRecommendations).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, workspaceId: WORKSPACE_ID },
    });
    expect(deleteRiskAssessments).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, workspaceId: WORKSPACE_ID },
    });

    for (const deletion of [
      deletePullRequests,
      deleteIssues,
      deleteWorkflowRuns,
    ]) {
      expect(deletion).toHaveBeenCalledWith({
        where: {
          repositoryId: REPOSITORY_ID,
          workspaceId: WORKSPACE_ID,
        },
      });
    }

    expect(deleteRepository).toHaveBeenCalledWith({
      where: {
        id: REPOSITORY_ID,
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
      },
    });
    expect(deleteProject).toHaveBeenCalledWith({
      where: {
        id_workspaceId: {
          id: PROJECT_ID,
          workspaceId: WORKSPACE_ID,
        },
      },
    });
    expect(deleteInstallations).not.toHaveBeenCalled();

    const deletionOrder = [
      deleteWebhookEvents,
      deleteRecommendations,
      deleteRiskAssessments,
      deleteWorkflowRuns,
      deleteIssues,
      deletePullRequests,
      deleteRepository,
      deleteProject,
    ].map((deletion) => deletion.mock.invocationCallOrder[0] ?? 0);

    expect(deletionOrder).toEqual(
      [...deletionOrder].sort((left, right) => left - right),
    );
  });

  it('allows an admin to delete a project', async () => {
    findMembership.mockResolvedValue({ role: 'ADMIN' });

    await expect(
      service.delete('user-1', WORKSPACE_ID, PROJECT_ID),
    ).resolves.toBeUndefined();

    expect(deleteProject).toHaveBeenCalledTimes(1);
  });

  it.each(['MEMBER', 'VIEWER'] as const)(
    'forbids a %s from deleting a project',
    async (role) => {
      findMembership.mockResolvedValue({ role });

      const deletion = service.delete(
        'user-1',
        WORKSPACE_ID,
        PROJECT_ID,
      );

      await expect(deletion).rejects.toThrow(ForbiddenException);
      await expect(deletion).rejects.toThrow(
        PROJECT_DELETE_FORBIDDEN_MESSAGE,
      );
      expect(findProject).not.toHaveBeenCalled();
      expect(deleteProject).not.toHaveBeenCalled();
    },
  );

  it('returns not found for a non-member without deleting anything', async () => {
    findMembership.mockResolvedValue(null);

    const deletion = service.delete(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    await expect(deletion).rejects.toThrow(NotFoundException);
    await expect(deletion).rejects.toThrow(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findProject).not.toHaveBeenCalled();
    expect(deleteWebhookEvents).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('returns not found when the project is absent from the workspace', async () => {
    findProject.mockResolvedValue(null);

    const deletion = service.delete(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    await expect(deletion).rejects.toThrow(NotFoundException);
    await expect(deletion).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE,
    );
    expect(findRepository).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('handles a legacy project without a repository', async () => {
    findRepository.mockResolvedValue(null);

    await expect(
      service.delete('user-1', WORKSPACE_ID, PROJECT_ID),
    ).resolves.toBeUndefined();

    expect(deleteWebhookEvents).not.toHaveBeenCalled();
    expect(deletePullRequests).not.toHaveBeenCalled();
    expect(deleteIssues).not.toHaveBeenCalled();
    expect(deleteWorkflowRuns).not.toHaveBeenCalled();
    expect(deleteRepository).not.toHaveBeenCalled();
    expect(deleteRecommendations).toHaveBeenCalledTimes(1);
    expect(deleteRiskAssessments).toHaveBeenCalledTimes(1);
    expect(deleteProject).toHaveBeenCalledTimes(1);
  });

  it('maps a missing project delete to not found', async () => {
    deleteProject.mockRejectedValue(databaseError('P2025'));

    const deletion = service.delete(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    await expect(deletion).rejects.toThrow(NotFoundException);
    await expect(deletion).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE,
    );
  });

  it('returns a safe internal error when a deletion step fails', async () => {
    deleteRecommendations.mockRejectedValue(
      new Error('foreign key constraint failed'),
    );

    const deletion = service.delete(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    await expect(deletion).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(deletion).rejects.toThrow(
      PROJECT_DELETION_FAILED_MESSAGE,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteProject).not.toHaveBeenCalled();
  });
});
