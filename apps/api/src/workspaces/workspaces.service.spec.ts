import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';
import {
  WORKSPACE_CREATION_FAILED_MESSAGE,
  WORKSPACE_LIST_FAILED_MESSAGE,
  WORKSPACE_NOT_FOUND_MESSAGE,
  WORKSPACE_OWNER_ROLE,
  WORKSPACE_RETRIEVAL_FAILED_MESSAGE,
  WORKSPACE_UPDATE_EMPTY_MESSAGE,
  WORKSPACE_UPDATE_FAILED_MESSAGE,
  WORKSPACE_UPDATE_FORBIDDEN_MESSAGE,
} from './workspace.constants';
import type { WorkspaceRoleName } from './workspace.types';
import { WorkspacesService } from './workspaces.service';

interface WorkspaceCreateArguments {
  data: {
    name: string;
    slug: string;
    description: string | null;
  };
  select: {
    id: true;
    name: true;
    slug: true;
    description: true;
    createdAt: true;
  };
}

interface CreatedWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
}

interface MembershipCreateArguments {
  data: {
    workspaceId: string;
    userId: string;
    role: 'OWNER';
  };
  select: {
    role: true;
  };
}

interface CreatedMembership {
  role: WorkspaceRoleName;
}

interface WorkspaceDetails {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MembershipWithWorkspace {
  role: WorkspaceRoleName;
  workspace: WorkspaceDetails;
}

interface WorkspaceDetailsSelect {
  id: true;
  name: true;
  slug: true;
  description: true;
  createdAt: true;
  updatedAt: true;
}

interface ListMembershipsArguments {
  where: { userId: string };
  orderBy: [
    { workspace: { createdAt: 'desc' } },
    { workspaceId: 'desc' },
  ];
  skip: number;
  take: number;
  select: {
    role: true;
    workspace: { select: WorkspaceDetailsSelect };
  };
}

interface CountMembershipsArguments {
  where: { userId: string };
}

interface FindMembershipArguments {
  where: { userId: string; workspaceId: string };
  select: {
    role: true;
    workspace: { select: WorkspaceDetailsSelect };
  };
}

interface WorkspaceUpdateArguments {
  where: { id: string };
  data: {
    name?: string;
    description?: string | null;
  };
  select: WorkspaceDetailsSelect;
}

interface FindUpdateMembershipArguments {
  where: { userId: string; workspaceId: string };
  select: { role: true };
}

interface UpdateMembership {
  role: WorkspaceRoleName;
}

interface TransactionClient {
  workspace: {
    create: (
      arguments_: WorkspaceCreateArguments,
    ) => Promise<CreatedWorkspace>;
    update: (
      arguments_: WorkspaceUpdateArguments,
    ) => Promise<WorkspaceDetails>;
  };
  workspaceMember: {
    create: (
      arguments_: MembershipCreateArguments,
    ) => Promise<CreatedMembership>;
    findFirst: (
      arguments_: FindUpdateMembershipArguments,
    ) => Promise<UpdateMembership | null>;
  };
}

type TransactionCallback = (
  transaction: TransactionClient,
) => Promise<unknown>;

const workspaceDetailsSelect: WorkspaceDetailsSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  createdAt: true,
  updatedAt: true,
};

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let createWorkspace: jest.MockedFunction<
    (arguments_: WorkspaceCreateArguments) => Promise<CreatedWorkspace>
  >;
  let createMembership: jest.MockedFunction<
    (arguments_: MembershipCreateArguments) => Promise<CreatedMembership>
  >;
  let findMemberships: jest.MockedFunction<
    (arguments_: ListMembershipsArguments) => Promise<
      MembershipWithWorkspace[]
    >
  >;
  let countMemberships: jest.MockedFunction<
    (arguments_: CountMembershipsArguments) => Promise<number>
  >;
  let findMembership: jest.MockedFunction<
    (arguments_: FindMembershipArguments) => Promise<MembershipWithWorkspace | null>
  >;
  let findUpdateMembership: jest.MockedFunction<
    (arguments_: FindUpdateMembershipArguments) => Promise<UpdateMembership | null>
  >;
  let updateWorkspace: jest.MockedFunction<
    (arguments_: WorkspaceUpdateArguments) => Promise<WorkspaceDetails>
  >;
  let transaction: jest.MockedFunction<
    (callback: TransactionCallback) => Promise<unknown>
  >;

  const createdAt = new Date('2026-11-02T12:00:00.000Z');
  const updatedAt = new Date('2026-11-02T13:00:00.000Z');
  const firstWorkspace: WorkspaceDetails = {
    id: 'workspace-1',
    name: 'First Workspace',
    slug: 'first-workspace-abcd1234',
    description: 'First description',
    createdAt,
    updatedAt,
  };
  const secondWorkspace: WorkspaceDetails = {
    id: 'workspace-2',
    name: 'Second Workspace',
    slug: 'second-workspace-abcd1234',
    description: null,
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
    updatedAt: new Date('2026-11-01T13:00:00.000Z'),
  };

  beforeEach(async () => {
    createWorkspace = jest.fn((arguments_) =>
      Promise.resolve({
        id: 'workspace-1',
        name: arguments_.data.name,
        slug: arguments_.data.slug,
        description: arguments_.data.description,
        createdAt,
      }),
    );
    createMembership = jest.fn((arguments_) =>
      Promise.resolve({ role: arguments_.data.role }),
    );
    findMemberships = jest.fn();
    countMemberships = jest.fn();
    findMembership = jest.fn();
    findUpdateMembership = jest.fn();
    updateWorkspace = jest.fn();
    transaction = jest.fn((callback) =>
      callback({
        workspace: {
          create: createWorkspace,
          update: updateWorkspace,
        },
        workspaceMember: {
          create: createMembership,
          findFirst: findUpdateMembership,
        },
      }),
    );

    const database = {
      client: {
        $transaction: transaction,
        workspaceMember: {
          findMany: findMemberships,
          count: countMemberships,
          findFirst: findMembership,
        },
      },
    } as unknown as DatabaseService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    service = module.get(WorkspacesService);
  });

  describe('create', () => {
    it('creates a workspace and its owner membership in one transaction', async () => {
      const dto: CreateWorkspaceDto = { name: 'My Workspace' };

      const response = await service.create('user-1', dto);
      const workspaceArguments = createWorkspace.mock.calls[0]?.[0];

      expect(response.slug).toMatch(/^my-workspace-[a-f0-9]{8}$/);
      expect(response).toEqual({
        id: 'workspace-1',
        name: 'My Workspace',
        slug: response.slug,
        description: null,
        role: WORKSPACE_OWNER_ROLE,
        createdAt,
      });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(workspaceArguments?.data.slug).toMatch(
        /^my-workspace-[a-f0-9]{8}$/,
      );
      expect(workspaceArguments).toEqual({
        data: {
          name: 'My Workspace',
          slug: workspaceArguments?.data.slug,
          description: null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
        },
      });
      expect(createMembership).toHaveBeenCalledWith({
        data: {
          workspaceId: 'workspace-1',
          userId: 'user-1',
          role: WORKSPACE_OWNER_ROLE,
        },
        select: { role: true },
      });
    });

    it('stores a supplied description and returns only safe fields', async () => {
      const response = await service.create('user-1', {
        name: 'My Workspace',
        description: 'A workspace description',
      });

      expect(createWorkspace.mock.calls[0]?.[0].data.description).toBe(
        'A workspace description',
      );
      expect(response.slug).toMatch(/^my-workspace-[a-f0-9]{8}$/);
      expect(response).toEqual({
        id: 'workspace-1',
        name: 'My Workspace',
        slug: response.slug,
        description: 'A workspace description',
        role: WORKSPACE_OWNER_ROLE,
        createdAt,
      });
      expect(response).not.toHaveProperty('userId');
      expect(response).not.toHaveProperty('members');
    });

    it('returns a generic error when the owner membership cannot be created', async () => {
      createMembership.mockRejectedValue(
        new Error('foreign key constraint failed'),
      );

      const creation = service.create('user-1', {
        name: 'My Workspace',
      });

      await expect(creation).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(creation).rejects.toThrow(
        WORKSPACE_CREATION_FAILED_MESSAGE,
      );
      expect(createWorkspace).toHaveBeenCalledTimes(1);
      expect(createMembership).toHaveBeenCalledTimes(1);
    });

    it('does not create a membership when the workspace cannot be created', async () => {
      createWorkspace.mockRejectedValue(
        new Error('workspace insert failed'),
      );

      await expect(
        service.create('user-1', { name: 'My Workspace' }),
      ).rejects.toThrow(WORKSPACE_CREATION_FAILED_MESSAGE);

      expect(createMembership).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns only the current user memberships with roles and pagination', async () => {
      findMemberships.mockResolvedValue([
        {
          role: WORKSPACE_OWNER_ROLE,
          workspace: firstWorkspace,
        },
        {
          role: 'MEMBER',
          workspace: secondWorkspace,
        },
      ]);
      countMemberships.mockResolvedValue(2);

      const response = await service.list('user-1', {});

      expect(response).toEqual({
        items: [
          {
            ...firstWorkspace,
            role: WORKSPACE_OWNER_ROLE,
          },
          {
            ...secondWorkspace,
            role: 'MEMBER',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      });
      expect(findMemberships).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [
          { workspace: { createdAt: 'desc' } },
          { workspaceId: 'desc' },
        ],
        skip: 0,
        take: 20,
        select: {
          role: true,
          workspace: { select: workspaceDetailsSelect },
        },
      });
      expect(countMemberships).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('applies validated page and limit values deterministically', async () => {
      findMemberships.mockResolvedValue([
        {
          role: 'ADMIN',
          workspace: firstWorkspace,
        },
      ]);
      countMemberships.mockResolvedValue(12);

      const response = await service.list('user-1', {
        page: 2,
        limit: 5,
      });

      expect(findMemberships).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          skip: 5,
          take: 5,
        }),
      );
      expect(response.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3,
      });
    });

    it('returns an empty page when the user has no memberships', async () => {
      findMemberships.mockResolvedValue([]);
      countMemberships.mockResolvedValue(0);

      await expect(service.list('user-1', {})).resolves.toEqual({
        items: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      });
    });

    it('returns a generic error when the list query fails', async () => {
      findMemberships.mockRejectedValue(
        new Error('database unavailable'),
      );
      countMemberships.mockResolvedValue(0);

      const listing = service.list('user-1', {});

      await expect(listing).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(listing).rejects.toThrow(
        WORKSPACE_LIST_FAILED_MESSAGE,
      );
    });
  });

  describe('get', () => {
    it('returns workspace details for an active member', async () => {
      findMembership.mockResolvedValue({
        role: 'ADMIN',
        workspace: firstWorkspace,
      });

      await expect(
        service.get('user-1', 'workspace-1'),
      ).resolves.toEqual({
        ...firstWorkspace,
        role: 'ADMIN',
      });

      expect(findMembership).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          workspaceId: 'workspace-1',
        },
        select: {
          role: true,
          workspace: { select: workspaceDetailsSelect },
        },
      });
    });

    it('returns not found when the user has no membership', async () => {
      findMembership.mockResolvedValue(null);

      const retrieval = service.get('user-1', 'workspace-1');

      await expect(retrieval).rejects.toThrow(NotFoundException);
      await expect(retrieval).rejects.toThrow(
        WORKSPACE_NOT_FOUND_MESSAGE,
      );
    });

    it('returns a generic error when the retrieval query fails', async () => {
      findMembership.mockRejectedValue(
        new Error('database unavailable'),
      );

      const retrieval = service.get('user-1', 'workspace-1');

      await expect(retrieval).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(retrieval).rejects.toThrow(
        WORKSPACE_RETRIEVAL_FAILED_MESSAGE,
      );
    });
  });

  describe('update', () => {
    const newUpdatedAt = new Date('2026-11-03T12:00:00.000Z');

    it('allows an owner to update the workspace name', async () => {
      findUpdateMembership.mockResolvedValue({ role: 'OWNER' });
      updateWorkspace.mockResolvedValue({
        ...firstWorkspace,
        name: 'Renamed Workspace',
        updatedAt: newUpdatedAt,
      });

      const response = await service.update(
        'user-1',
        'workspace-1',
        { name: 'Renamed Workspace' },
      );

      expect(response).toEqual({
        ...firstWorkspace,
        name: 'Renamed Workspace',
        updatedAt: newUpdatedAt,
        role: 'OWNER',
      });
      expect(findUpdateMembership).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          workspaceId: 'workspace-1',
        },
        select: { role: true },
      });
      expect(updateWorkspace).toHaveBeenCalledWith({
        where: { id: 'workspace-1' },
        data: { name: 'Renamed Workspace' },
        select: workspaceDetailsSelect,
      });
    });

    it('allows an admin to update and clear the description', async () => {
      findUpdateMembership.mockResolvedValue({ role: 'ADMIN' });
      updateWorkspace.mockResolvedValue({
        ...firstWorkspace,
        description: null,
        updatedAt: newUpdatedAt,
      });

      const response = await service.update(
        'user-1',
        'workspace-1',
        { description: null },
      );

      expect(response.description).toBeNull();
      expect(response.role).toBe('ADMIN');
      expect(updateWorkspace).toHaveBeenCalledWith({
        where: { id: 'workspace-1' },
        data: { description: null },
        select: workspaceDetailsSelect,
      });
    });

    it('forbids a member from updating workspace details', async () => {
      findUpdateMembership.mockResolvedValue({ role: 'MEMBER' });

      const update = service.update('user-1', 'workspace-1', {
        name: 'Renamed Workspace',
      });

      await expect(update).rejects.toThrow(ForbiddenException);
      await expect(update).rejects.toThrow(
        WORKSPACE_UPDATE_FORBIDDEN_MESSAGE,
      );
      expect(updateWorkspace).not.toHaveBeenCalled();
    });

    it('returns not found for a non-member', async () => {
      findUpdateMembership.mockResolvedValue(null);

      const update = service.update('user-1', 'workspace-1', {
        name: 'Renamed Workspace',
      });

      await expect(update).rejects.toThrow(NotFoundException);
      await expect(update).rejects.toThrow(
        WORKSPACE_NOT_FOUND_MESSAGE,
      );
      expect(updateWorkspace).not.toHaveBeenCalled();
    });

    it('rejects an empty update body before querying memberships', async () => {
      const update = service.update('user-1', 'workspace-1', {});

      await expect(update).rejects.toThrow(BadRequestException);
      await expect(update).rejects.toThrow(
        WORKSPACE_UPDATE_EMPTY_MESSAGE,
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('returns a generic error when the update query fails', async () => {
      findUpdateMembership.mockResolvedValue({ role: 'OWNER' });
      updateWorkspace.mockRejectedValue(
        new Error('database unavailable'),
      );

      const update = service.update('user-1', 'workspace-1', {
        name: 'Renamed Workspace',
      });

      await expect(update).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(update).rejects.toThrow(
        WORKSPACE_UPDATE_FAILED_MESSAGE,
      );
    });
  });
});
