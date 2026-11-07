import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { WORKSPACE_NOT_FOUND_MESSAGE } from '../workspaces/workspace.constants';
import type { WorkspaceRoleName } from '../workspaces/workspace.types';
import type { CreateProjectDto } from './dto/create-project.dto';
import {
  PROJECT_CREATION_CONFLICT_MESSAGE,
  PROJECT_CREATION_FAILED_MESSAGE,
  PROJECT_CREATION_FORBIDDEN_MESSAGE,
  PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
  PROJECT_REPOSITORY_ARCHIVED_MESSAGE,
  PROJECT_REPOSITORY_INVALID_MESSAGE,
  PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
} from './project.constants';
import type {
  RepositoryConnectionStatusName,
  RepositoryVisibilityName,
} from './project.types';
import { ProjectsService } from './projects.service';
import {
  GITHUB_REPOSITORY_RESOLVER,
  type GitHubRepositoryResolver,
  type ResolvedGitHubRepository,
} from './repository-resolver';

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

interface CreatedProject {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreatedRepository {
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
    ) => Promise<CreatedRepository>;
  };
  gitHubInstallation: {
    findFirst: (
      arguments_: InstallationFindFirstArguments,
    ) => Promise<{ id: string } | null>;
  };
  project: {
    create: (
      arguments_: ProjectCreateArguments,
    ) => Promise<CreatedProject>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

const WORKSPACE_ID = '7f8f3b9e-4f16-4f8a-b3d7-9a7b7b5f6d02';
const CREATED_AT = new Date('2026-11-04T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-04T10:00:00.000Z');

const RESOLVED_REPOSITORY: ResolvedGitHubRepository = {
  githubId: 123456789n,
  installationId: 'installation-1',
  ownerLogin: 'acme',
  name: 'checkout-api',
  fullName: 'acme/checkout-api',
  defaultBranch: 'main',
  visibility: 'PRIVATE',
  isArchived: false,
};

describe('ProjectsService', () => {
  let service: ProjectsService;
  let findMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{
      role: WorkspaceRoleName;
    } | null>
  >;
  let findExistingRepository: jest.MockedFunction<
    (arguments_: RepositoryFindUniqueArguments) => Promise<{
      id: string;
    } | null>
  >;
  let findTransactionMembership: jest.MockedFunction<
    (arguments_: MembershipFindArguments) => Promise<{
      role: WorkspaceRoleName;
    } | null>
  >;
  let findTransactionRepository: jest.MockedFunction<
    (arguments_: RepositoryFindUniqueArguments) => Promise<{
      id: string;
    } | null>
  >;
  let findInstallation: jest.MockedFunction<
    (arguments_: InstallationFindFirstArguments) => Promise<{
      id: string;
    } | null>
  >;
  let createProject: jest.MockedFunction<
    (arguments_: ProjectCreateArguments) => Promise<CreatedProject>
  >;
  let createRepository: jest.MockedFunction<
    (arguments_: RepositoryCreateArguments) => Promise<CreatedRepository>
  >;
  let resolveRepository: jest.MockedFunction<
    GitHubRepositoryResolver['resolve']
  >;
  let transaction: jest.MockedFunction<
    (callback: TransactionCallback) => Promise<unknown>
  >;

  const dto: CreateProjectDto = {
    name: 'Checkout API',
    description: 'Checkout service',
    repositoryGithubId: '123456789',
  };

  function createdProject(
    arguments_: ProjectCreateArguments,
  ): CreatedProject {
    return {
      id: 'project-1',
      workspaceId: arguments_.data.workspaceId,
      name: arguments_.data.name,
      description: arguments_.data.description,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };
  }

  function createdRepository(
    arguments_: RepositoryCreateArguments,
  ): CreatedRepository {
    return {
      id: 'repository-1',
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
    };
  }

  beforeEach(async () => {
    findMembership = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve({ role: 'OWNER' });
    });
    findExistingRepository = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve(null);
    });
    findTransactionMembership = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve({ role: 'OWNER' });
    });
    findTransactionRepository = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve(null);
    });
    findInstallation = jest.fn((arguments_) => {
      void arguments_;

      return Promise.resolve({ id: 'installation-1' });
    });
    createProject = jest.fn((arguments_) =>
      Promise.resolve(createdProject(arguments_)),
    );
    createRepository = jest.fn((arguments_) =>
      Promise.resolve(createdRepository(arguments_)),
    );
    resolveRepository = jest.fn((workspaceId, githubId) => {
      void workspaceId;
      void githubId;

      return Promise.resolve({ ...RESOLVED_REPOSITORY });
    });
    transaction = jest.fn((callback) =>
      callback({
        workspaceMember: { findFirst: findTransactionMembership },
        repository: {
          findUnique: findTransactionRepository,
          create: createRepository,
        },
        gitHubInstallation: { findFirst: findInstallation },
        project: { create: createProject },
      }),
    );

    const database = {
      client: {
        workspaceMember: { findFirst: findMembership },
        repository: { findUnique: findExistingRepository },
        $transaction: transaction,
      },
    } as unknown as DatabaseService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DatabaseService, useValue: database },
        {
          provide: GITHUB_REPOSITORY_RESOLVER,
          useValue: { resolve: resolveRepository },
        },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  it('creates a project and its repository atomically for an owner', async () => {
    const response = await service.create('user-1', WORKSPACE_ID, dto);
    const projectArguments = createProject.mock.calls[0]?.[0];

    expect(response).toEqual({
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
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(resolveRepository).toHaveBeenCalledWith(
      WORKSPACE_ID,
      123456789n,
    );
    expect(projectArguments?.data.slug).toMatch(
      /^checkout-api-[a-f0-9]{8}$/,
    );
    expect(projectArguments).toEqual({
      data: {
        workspaceId: WORKSPACE_ID,
        name: 'Checkout API',
        slug: projectArguments?.data.slug,
        description: 'Checkout service',
      },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(createRepository).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        projectId: 'project-1',
        installationId: 'installation-1',
        githubId: 123456789n,
        ownerLogin: 'acme',
        name: 'checkout-api',
        fullName: 'acme/checkout-api',
        defaultBranch: 'main',
        visibility: 'PRIVATE',
        isArchived: false,
        connectionStatus: 'ACTIVE',
      },
      select: {
        id: true,
        githubId: true,
        ownerLogin: true,
        name: true,
        fullName: true,
        defaultBranch: true,
        visibility: true,
        isArchived: true,
        connectionStatus: true,
        connectedAt: true,
        disconnectedAt: true,
        lastSyncedAt: true,
      },
    });
    expect(findInstallation).toHaveBeenCalledWith({
      where: {
        id: 'installation-1',
        workspaceId: WORKSPACE_ID,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(response).not.toHaveProperty('installationId');
    expect(response.repository).not.toHaveProperty('installationId');
  });

  it('allows an admin to create a project', async () => {
    findMembership.mockResolvedValue({ role: 'ADMIN' });
    findTransactionMembership.mockResolvedValue({ role: 'ADMIN' });

    await expect(
      service.create('user-1', WORKSPACE_ID, dto),
    ).resolves.toMatchObject({ id: 'project-1' });
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it.each(['MEMBER', 'VIEWER'] as const)(
    'forbids a %s from creating a project',
    async (role) => {
      findMembership.mockResolvedValue({ role });

      const creation = service.create('user-1', WORKSPACE_ID, dto);

      await expect(creation).rejects.toThrow(ForbiddenException);
      await expect(creation).rejects.toThrow(
        PROJECT_CREATION_FORBIDDEN_MESSAGE,
      );
      expect(resolveRepository).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('returns not found for a non-member', async () => {
    findMembership.mockResolvedValue(null);

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(NotFoundException);
    await expect(creation).rejects.toThrow(
      WORKSPACE_NOT_FOUND_MESSAGE,
    );
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a repository that is already connected', async () => {
    findExistingRepository.mockResolvedValue({ id: 'repository-1' });

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(ConflictException);
    await expect(creation).rejects.toThrow(
      PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
    );
    expect(resolveRepository).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an archived repository', async () => {
    resolveRepository.mockResolvedValue({
      ...RESOLVED_REPOSITORY,
      isArchived: true,
    });

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(BadRequestException);
    await expect(creation).rejects.toThrow(
      PROJECT_REPOSITORY_ARCHIVED_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a resolver result for a different GitHub repository', async () => {
    resolveRepository.mockResolvedValue({
      ...RESOLVED_REPOSITORY,
      githubId: 987654321n,
    });

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(NotFoundException);
    await expect(creation).rejects.toThrow(
      PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a repository installation outside the workspace or inactive', async () => {
    findInstallation.mockResolvedValue(null);

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(NotFoundException);
    await expect(creation).rejects.toThrow(
      PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
    );
    expect(findInstallation).toHaveBeenCalledWith({
      where: {
        id: 'installation-1',
        workspaceId: WORKSPACE_ID,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(createProject).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('rechecks authorization inside the creation transaction', async () => {
    findTransactionMembership.mockResolvedValue({ role: 'MEMBER' });

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(ForbiddenException);
    await expect(creation).rejects.toThrow(
      PROJECT_CREATION_FORBIDDEN_MESSAGE,
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it('rejects a repository connected between the check and the write', async () => {
    findTransactionRepository.mockResolvedValue({
      id: 'repository-1',
    });

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(ConflictException);
    await expect(creation).rejects.toThrow(
      PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it('rejects invalid repository GitHub identifiers before querying', async () => {
    for (const repositoryGithubId of [
      '0',
      '0001',
      '-1',
      '9223372036854775808',
    ]) {
      await expect(
        service.create('user-1', WORKSPACE_ID, {
          ...dto,
          repositoryGithubId,
        }),
      ).rejects.toThrow(PROJECT_REPOSITORY_INVALID_MESSAGE);
    }

    expect(findMembership).not.toHaveBeenCalled();
  });

  it('returns a generic error when project creation fails', async () => {
    createProject.mockRejectedValue(
      new Error('database unavailable'),
    );

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(creation).rejects.toThrow(
      PROJECT_CREATION_FAILED_MESSAGE,
    );
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('maps a unique constraint race to a conflict', async () => {
    createRepository.mockRejectedValue({ code: 'P2002' });

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(ConflictException);
    await expect(creation).rejects.toThrow(
      PROJECT_CREATION_CONFLICT_MESSAGE,
    );
  });

  it('maps a foreign key failure to repository not found', async () => {
    createRepository.mockRejectedValue({ code: 'P2003' });

    const creation = service.create('user-1', WORKSPACE_ID, dto);

    await expect(creation).rejects.toThrow(NotFoundException);
    await expect(creation).rejects.toThrow(
      PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
    );
  });
});
