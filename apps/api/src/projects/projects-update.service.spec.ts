import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { WORKSPACE_NOT_FOUND_MESSAGE } from '../workspaces/workspace.constants';
import type { WorkspaceRoleName } from '../workspaces/workspace.types';
import type { UpdateProjectDto } from './dto/update-project.dto';
import {
  PROJECT_NOT_FOUND_MESSAGE,
  PROJECT_UPDATE_EMPTY_MESSAGE,
  PROJECT_UPDATE_FAILED_MESSAGE,
  PROJECT_UPDATE_FORBIDDEN_MESSAGE,
} from './project.constants';
import type {
  RepositoryConnectionStatusName,
  RepositoryVisibilityName,
} from './project.types';
import { ProjectsService } from './projects.service';
import { GITHUB_REPOSITORY_RESOLVER } from './repository-resolver';

interface MembershipFindArguments {
  where: { userId: string; workspaceId: string };
  select: { role: true };
}

interface ProjectUpdateArguments {
  where: { id_workspaceId: { id: string; workspaceId: string } };
  data: {
    name?: string;
    description?: string | null;
  };
  select: Record<string, unknown>;
}

interface TransactionClient {
  workspaceMember: {
    findFirst: (
      arguments_: MembershipFindArguments,
    ) => Promise<{ role: WorkspaceRoleName } | null>;
  };
  project: {
    update: (
      arguments_: ProjectUpdateArguments,
    ) => Promise<StoredProject>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

interface StoredRepository {
  id: string;
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
}

interface StoredProject {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  repository: StoredRepository | null;
}

const WORKSPACE_ID = '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02';
const PROJECT_ID = '8f0a7c2e-1f9b-4d10-9a2b-3c4d5e6f7081';
const CREATED_AT = new Date('2026-11-04T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-04T12:00:00.000Z');

function databaseError(code: string): Error {
  return Object.assign(new Error(`Database error ${code}`), { code });
}

function storedRepository(): StoredRepository {
  return {
    id: 'repository-1',
    githubId: 123456789n,
    ownerLogin: 'acme',
    name: 'checkout-api',
    fullName: 'acme/checkout-api',
    defaultBranch: 'main',
    visibility: 'PRIVATE',
    isArchived: false,
    connectionStatus: 'ACTIVE',
    connectedAt: CREATED_AT,
    disconnectedAt: null,
    lastSyncedAt: null,
  };
}

describe('ProjectsService update', () => {
  let service: ProjectsService;
  let findMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{
      role: WorkspaceRoleName;
    } | null>
  >;
  let updateProject: jest.MockedFunction<
    (arguments_: ProjectUpdateArguments) => Promise<StoredProject>
  >;
  let transaction: jest.MockedFunction<
    (callback: TransactionCallback) => Promise<unknown>
  >;

  beforeEach(async () => {
    findMembership = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve({ role: 'OWNER' });
    });
    updateProject = jest.fn((arguments_) => {
      return Promise.resolve({
        id: arguments_.where.id_workspaceId.id,
        workspaceId: arguments_.where.id_workspaceId.workspaceId,
        name: arguments_.data.name ?? 'Checkout API',
        description:
          arguments_.data.description === undefined
            ? 'Checkout service'
            : arguments_.data.description,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        repository: storedRepository(),
      });
    });
    transaction = jest.fn((callback) =>
      callback({
        workspaceMember: { findFirst: findMembership },
        project: { update: updateProject },
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
  });

  it('updates name and description for an owner', async () => {
    const response = await service.update(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
      {
        name: 'Updated Project',
        description: 'Updated description',
      },
    );

    expect(response).toEqual({
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: 'Updated Project',
      description: 'Updated description',
      repository: {
        id: 'repository-1',
        githubId: '123456789',
        ownerLogin: 'acme',
        name: 'checkout-api',
        fullName: 'acme/checkout-api',
        defaultBranch: 'main',
        visibility: 'PRIVATE',
        isArchived: false,
        connectionStatus: 'ACTIVE',
        connectedAt: CREATED_AT,
        disconnectedAt: null,
        lastSyncedAt: null,
      },
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_workspaceId: {
            id: PROJECT_ID,
            workspaceId: WORKSPACE_ID,
          },
        },
        data: {
          name: 'Updated Project',
          description: 'Updated description',
        },
      }),
    );
    expect(response).not.toHaveProperty('slug');
    expect(response.repository).not.toHaveProperty('installationId');
  });

  it('updates only the name when description is omitted', async () => {
    await service.update('user-1', WORKSPACE_ID, PROJECT_ID, {
      name: 'Renamed Project',
    });

    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_workspaceId: {
            id: PROJECT_ID,
            workspaceId: WORKSPACE_ID,
          },
        },
        data: { name: 'Renamed Project' },
      }),
    );
  });

  it('updates only the description when name is omitted', async () => {
    await service.update('user-1', WORKSPACE_ID, PROJECT_ID, {
      description: 'New description',
    });

    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_workspaceId: {
            id: PROJECT_ID,
            workspaceId: WORKSPACE_ID,
          },
        },
        data: { description: 'New description' },
      }),
    );
  });

  it('clears the description when null is supplied', async () => {
    const response = await service.update(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
      { description: null },
    );

    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_workspaceId: {
            id: PROJECT_ID,
            workspaceId: WORKSPACE_ID,
          },
        },
        data: { description: null },
      }),
    );
    expect(response.description).toBeNull();
  });

  it('allows an admin to update a project', async () => {
    findMembership.mockResolvedValue({ role: 'ADMIN' });

    await expect(
      service.update('user-1', WORKSPACE_ID, PROJECT_ID, {
        name: 'Updated Project',
      }),
    ).resolves.toMatchObject({ id: PROJECT_ID });
    expect(updateProject).toHaveBeenCalledTimes(1);
  });

  it.each(['MEMBER', 'VIEWER'] as const)(
    'forbids a %s from updating a project',
    async (role) => {
      findMembership.mockResolvedValue({ role });

      const update = service.update(
        'user-1',
        WORKSPACE_ID,
        PROJECT_ID,
        { name: 'Updated Project' },
      );

      await expect(update).rejects.toThrow(ForbiddenException);
      await expect(update).rejects.toThrow(
        PROJECT_UPDATE_FORBIDDEN_MESSAGE,
      );
      expect(updateProject).not.toHaveBeenCalled();
    },
  );

  it('returns not found for a non-member without updating', async () => {
    findMembership.mockResolvedValue(null);

    const update = service.update(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
      { name: 'Updated Project' },
    );

    await expect(update).rejects.toThrow(NotFoundException);
    await expect(update).rejects.toThrow(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(updateProject).not.toHaveBeenCalled();
  });

  it('rejects an empty update body before opening a transaction', async () => {
    const update = service.update(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
      {},
    );

    await expect(update).rejects.toThrow(BadRequestException);
    await expect(update).rejects.toThrow(
      PROJECT_UPDATE_EMPTY_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns not found when the project is absent from the workspace', async () => {
    updateProject.mockRejectedValue(databaseError('P2025'));

    const update = service.update(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
      { name: 'Updated Project' },
    );

    await expect(update).rejects.toThrow(NotFoundException);
    await expect(update).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE,
    );
  });

  it('returns a safe internal error when the database fails', async () => {
    updateProject.mockRejectedValue(new Error('database offline'));

    const update = service.update(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
      { name: 'Updated Project' },
    );

    await expect(update).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(update).rejects.toThrow(
      PROJECT_UPDATE_FAILED_MESSAGE,
    );
  });

  it('does not accept repository or workspace changes', async () => {
    await service.update('user-1', WORKSPACE_ID, PROJECT_ID, {
      name: 'Updated Project',
      description: 'Updated description',
    });

    const arguments_ = updateProject.mock.calls[0]?.[0];
    const data = arguments_?.data as UpdateProjectDto &
      Record<string, unknown>;

    expect(data).toEqual({
      name: 'Updated Project',
      description: 'Updated description',
    });
    expect(data).not.toHaveProperty('workspaceId');
    expect(data).not.toHaveProperty('repositoryId');
    expect(data).not.toHaveProperty('repository');
    expect(data).not.toHaveProperty('slug');
  });
});
