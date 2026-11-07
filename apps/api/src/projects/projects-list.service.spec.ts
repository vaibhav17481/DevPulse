import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { WORKSPACE_NOT_FOUND_MESSAGE } from '../workspaces/workspace.constants';
import type { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import {
  PROJECT_LIST_DEFAULT_LIMIT,
  PROJECT_LIST_DEFAULT_PAGE,
  PROJECT_LIST_FAILED_MESSAGE,
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
    id: 'project-1',
    workspaceId: WORKSPACE_ID,
    name: 'Checkout API',
    description: 'Checkout service',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    repository: storedRepository(),
    ...overrides,
  };
}

describe('ProjectsService listing', () => {
  let service: ProjectsService;
  let findMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{ id: string } | null>
  >;
  let findManyProjects: jest.MockedFunction<
    (
      arguments_: ProjectListFindManyArguments,
    ) => Promise<StoredProject[]>
  >;
  let countProjects: jest.MockedFunction<
    (arguments_: ProjectCountArguments) => Promise<number>
  >;

  const query: ListProjectsQueryDto = {};

  beforeEach(async () => {
    findMembership = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve({ id: 'membership-1' });
    });
    findManyProjects = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve([storedProject()]);
    });
    countProjects = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve(1);
    });

    const database = {
      client: {
        workspaceMember: { findFirst: findMembership },
        project: {
          findMany: findManyProjects,
          count: countProjects,
        },
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

  it('lists workspace projects with a mapped repository', async () => {
    const response = await service.list(
      'user-1',
      WORKSPACE_ID,
      query,
    );

    expect(response).toEqual({
      items: [
        {
          id: 'project-1',
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
        },
      ],
      pagination: {
        page: PROJECT_LIST_DEFAULT_PAGE,
        limit: PROJECT_LIST_DEFAULT_LIMIT,
        total: 1,
        totalPages: 1,
      },
    });
    expect(findMembership).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: WORKSPACE_ID },
      select: { id: true },
    });
    expect(findManyProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: WORKSPACE_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: PROJECT_LIST_DEFAULT_LIMIT,
      }),
    );
    expect(countProjects).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
    });
    expect(response.items[0]).not.toHaveProperty('slug');
    expect(response.items[0]?.repository).not.toHaveProperty(
      'installationId',
    );
  });

  it('returns an empty page for a workspace with no projects', async () => {
    findManyProjects.mockResolvedValue([]);
    countProjects.mockResolvedValue(0);

    const response = await service.list(
      'user-1',
      WORKSPACE_ID,
      query,
    );

    expect(response.items).toEqual([]);
    expect(response.pagination).toEqual({
      page: 1,
      limit: PROJECT_LIST_DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
    });
  });

  it('applies page and limit to the scoped query', async () => {
    await service.list('user-1', WORKSPACE_ID, {
      page: 3,
      limit: 5,
    });

    expect(findManyProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: WORKSPACE_ID },
        skip: 10,
        take: 5,
      }),
    );
    expect(countProjects).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
    });
  });

  it('keeps legacy projects without a repository visible defensively', async () => {
    findManyProjects.mockResolvedValue([
      storedProject({ repository: null }),
    ]);

    const response = await service.list(
      'user-1',
      WORKSPACE_ID,
      query,
    );

    expect(response.items[0]?.repository).toBeNull();
  });

  it('returns not found for a non-member without querying projects', async () => {
    findMembership.mockResolvedValue(null);

    const listing = service.list('user-1', WORKSPACE_ID, query);

    await expect(listing).rejects.toThrow(NotFoundException);
    await expect(listing).rejects.toThrow(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(findManyProjects).not.toHaveBeenCalled();
    expect(countProjects).not.toHaveBeenCalled();
  });

  it('does not query projects from another workspace', async () => {
    await service.list('user-1', OTHER_WORKSPACE_ID, query);

    expect(findMembership).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        workspaceId: OTHER_WORKSPACE_ID,
      },
      select: { id: true },
    });
    expect(findManyProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: OTHER_WORKSPACE_ID },
      }),
    );
  });

  it('returns a safe internal error when the database fails', async () => {
    findManyProjects.mockRejectedValue(new Error('database offline'));

    const listing = service.list('user-1', WORKSPACE_ID, query);

    await expect(listing).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(listing).rejects.toThrow(
      PROJECT_LIST_FAILED_MESSAGE,
    );
  });
});
