import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { WORKSPACE_NOT_FOUND_MESSAGE } from '../workspaces/workspace.constants';
import {
  PROJECT_NOT_FOUND_MESSAGE,
  PROJECT_RETRIEVAL_FAILED_MESSAGE,
} from './project.constants';
import type {
  RepositoryConnectionStatusName,
  RepositoryVisibilityName,
} from './project.types';
import { ProjectsService } from './projects.service';
import { GITHUB_REPOSITORY_RESOLVER } from './repository-resolver';

interface MembershipFindArguments {
  where: { userId: string; workspaceId: string };
  select: { id: true };
}

interface ProjectFindFirstArguments {
  where: { id: string; workspaceId: string };
  select: Record<string, unknown>;
}

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
const OTHER_WORKSPACE_ID = '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081';
const PROJECT_ID = '8f0a7c2e-1f9b-4d10-9a2b-3c4d5e6f7081';
const CREATED_AT = new Date('2026-11-04T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-04T11:00:00.000Z');

function storedRepository(
  overrides: Partial<StoredRepository> = {},
): StoredRepository {
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
    ...overrides,
  };
}

function storedProject(
  overrides: Partial<StoredProject> = {},
): StoredProject {
  return {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Checkout API',
    description: 'Checkout service',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    repository: storedRepository(),
    ...overrides,
  };
}

describe('ProjectsService retrieval', () => {
  let service: ProjectsService;
  let findMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{ id: string } | null>
  >;
  let findProject: jest.MockedFunction<
    (
      arguments_: ProjectFindFirstArguments,
    ) => Promise<StoredProject | null>
  >;

  beforeEach(async () => {
    findMembership = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve({ id: 'membership-1' });
    });
    findProject = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve(storedProject());
    });

    const database = {
      client: {
        workspaceMember: { findFirst: findMembership },
        project: { findFirst: findProject },
      },
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

  it('retrieves a project scoped to the workspace', async () => {
    const response = await service.get(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    expect(response).toEqual({
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: 'Checkout API',
      description: 'Checkout service',
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
    expect(findMembership).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: WORKSPACE_ID },
      select: { id: true },
    });
    expect(findProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_ID, workspaceId: WORKSPACE_ID },
      }),
    );
    expect(response).not.toHaveProperty('slug');
    expect(response.repository).not.toHaveProperty('installationId');
  });

  it('returns null for a defensively missing repository', async () => {
    findProject.mockResolvedValue(
      storedProject({ repository: null }),
    );

    const response = await service.get(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    expect(response.repository).toBeNull();
  });

  it('returns not found for a non-member without querying projects', async () => {
    findMembership.mockResolvedValue(null);

    const retrieval = service.get(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    await expect(retrieval).rejects.toThrow(NotFoundException);
    await expect(retrieval).rejects.toThrow(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findProject).not.toHaveBeenCalled();
  });

  it('returns not found when the project is absent from the workspace', async () => {
    findProject.mockResolvedValue(null);

    const retrieval = service.get(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    await expect(retrieval).rejects.toThrow(NotFoundException);
    await expect(retrieval).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE,
    );
  });

  it('scopes the lookup to the path workspace, not the project workspace', async () => {
    await service.get('user-1', OTHER_WORKSPACE_ID, PROJECT_ID);

    expect(findProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: PROJECT_ID,
          workspaceId: OTHER_WORKSPACE_ID,
        },
      }),
    );
  });

  it('returns a safe internal error when the database fails', async () => {
    findProject.mockRejectedValue(new Error('database offline'));

    const retrieval = service.get(
      'user-1',
      WORKSPACE_ID,
      PROJECT_ID,
    );

    await expect(retrieval).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(retrieval).rejects.toThrow(
      PROJECT_RETRIEVAL_FAILED_MESSAGE,
    );
  });
});
