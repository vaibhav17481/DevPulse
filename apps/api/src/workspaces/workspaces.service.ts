import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';
import type { ListWorkspacesQueryDto } from './dto/list-workspaces-query.dto';
import type { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import {
  WORKSPACE_CREATION_FAILED_MESSAGE,
  WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
  WORKSPACE_DELETION_FAILED_MESSAGE,
  WORKSPACE_LIST_DEFAULT_LIMIT,
  WORKSPACE_LIST_DEFAULT_PAGE,
  WORKSPACE_LIST_FAILED_MESSAGE,
  WORKSPACE_NOT_FOUND_MESSAGE,
  WORKSPACE_OWNER_ROLE,
  WORKSPACE_RETRIEVAL_FAILED_MESSAGE,
  WORKSPACE_UPDATE_EMPTY_MESSAGE,
  WORKSPACE_UPDATE_FAILED_MESSAGE,
  WORKSPACE_UPDATE_FORBIDDEN_MESSAGE,
  WORKSPACE_UPDATE_ROLES,
} from './workspace.constants';
import { createWorkspaceSlug } from './workspace-slug';
import type {
  CreateWorkspaceResponse,
  WorkspaceListResponse,
  WorkspaceResponse,
  WorkspaceRoleName,
} from './workspace.types';

const WORKSPACE_DETAILS_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface MembershipWithWorkspace {
  role: WorkspaceRoleName;
  workspace: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

function mapMembership(
  membership: MembershipWithWorkspace,
): WorkspaceResponse {
  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    description: membership.workspace.description,
    role: membership.role,
    createdAt: membership.workspace.createdAt,
    updatedAt: membership.workspace.updatedAt,
  };
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly database: DatabaseService) {}

  async create(
    userId: string,
    dto: CreateWorkspaceDto,
  ): Promise<CreateWorkspaceResponse> {
    const slug = createWorkspaceSlug(dto.name);

    try {
      return await this.database.client.$transaction(async (transaction) => {
        const workspace = await transaction.workspace.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description ?? null,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
          },
        });

        const membership = await transaction.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId,
            role: WORKSPACE_OWNER_ROLE,
          },
          select: {
            role: true,
          },
        });

        return {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          description: workspace.description,
          role: membership.role,
          createdAt: workspace.createdAt,
        };
      });
    } catch {
      throw new InternalServerErrorException(
        WORKSPACE_CREATION_FAILED_MESSAGE,
      );
    }
  }

  async list(
    userId: string,
    query: ListWorkspacesQueryDto,
  ): Promise<WorkspaceListResponse> {
    const page = query.page ?? WORKSPACE_LIST_DEFAULT_PAGE;
    const limit = query.limit ?? WORKSPACE_LIST_DEFAULT_LIMIT;

    try {
      const where = { userId };
      const [memberships, total] = await Promise.all([
        this.database.client.workspaceMember.findMany({
          where,
          orderBy: [
            { workspace: { createdAt: 'desc' } },
            { workspaceId: 'desc' },
          ],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            role: true,
            workspace: {
              select: WORKSPACE_DETAILS_SELECT,
            },
          },
        }),
        this.database.client.workspaceMember.count({ where }),
      ]);

      return {
        items: memberships.map((membership) =>
          mapMembership(membership),
        ),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        WORKSPACE_LIST_FAILED_MESSAGE,
      );
    }
  }

  async get(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceResponse> {
    try {
      const membership =
        await this.database.client.workspaceMember.findFirst({
          where: { userId, workspaceId },
          select: {
            role: true,
            workspace: {
              select: WORKSPACE_DETAILS_SELECT,
            },
          },
        });

      if (!membership) {
        throw new NotFoundException(WORKSPACE_NOT_FOUND_MESSAGE);
      }

      return mapMembership(membership);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        WORKSPACE_RETRIEVAL_FAILED_MESSAGE,
      );
    }
  }

  async update(
    userId: string,
    workspaceId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponse> {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException(WORKSPACE_UPDATE_EMPTY_MESSAGE);
    }

    try {
      return await this.database.client.$transaction(
        async (transaction) => {
          const membership =
            await transaction.workspaceMember.findFirst({
              where: { userId, workspaceId },
              select: { role: true },
            });

          if (!membership) {
            throw new NotFoundException(WORKSPACE_NOT_FOUND_MESSAGE);
          }

          if (
            !(WORKSPACE_UPDATE_ROLES as readonly WorkspaceRoleName[]).includes(
              membership.role,
            )
          ) {
            throw new ForbiddenException(
              WORKSPACE_UPDATE_FORBIDDEN_MESSAGE,
            );
          }

          const workspace = await transaction.workspace.update({
            where: { id: workspaceId },
            data: {
              ...(dto.name !== undefined ? { name: dto.name } : {}),
              ...(dto.description !== undefined
                ? { description: dto.description }
                : {}),
            },
            select: WORKSPACE_DETAILS_SELECT,
          });

          return {
            ...workspace,
            role: membership.role,
          };
        },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        WORKSPACE_UPDATE_FAILED_MESSAGE,
      );
    }
  }

  async delete(userId: string, workspaceId: string): Promise<void> {
    try {
      await this.database.client.$transaction(async (transaction) => {
        const membership =
          await transaction.workspaceMember.findFirst({
            where: { userId, workspaceId },
            select: { role: true },
          });

        if (!membership) {
          throw new NotFoundException(WORKSPACE_NOT_FOUND_MESSAGE);
        }

        if (membership.role !== WORKSPACE_OWNER_ROLE) {
          throw new ForbiddenException(
            WORKSPACE_DELETE_FORBIDDEN_MESSAGE,
          );
        }

        const installation =
          await transaction.gitHubInstallation.findUnique({
            where: { workspaceId },
            select: { id: true },
          });
        const repositories = await transaction.repository.findMany({
          where: { workspaceId },
          select: { id: true },
        });
        const repositoryIds = repositories.map(
          (repository) => repository.id,
        );
        const installationId = installation?.id;

        await transaction.webhookEvent.deleteMany({
          where: {
            OR: [
              { workspaceId },
              ...(installationId ? [{ installationId }] : []),
              ...(repositoryIds.length > 0
                ? [{ repositoryId: { in: repositoryIds } }]
                : []),
            ],
          },
        });

        await transaction.recommendation.deleteMany({
          where: { workspaceId },
        });
        await transaction.riskAssessment.deleteMany({
          where: { workspaceId },
        });
        await transaction.pullRequest.deleteMany({
          where: { workspaceId },
        });
        await transaction.issue.deleteMany({
          where: { workspaceId },
        });
        await transaction.workflowRun.deleteMany({
          where: { workspaceId },
        });
        await transaction.repository.deleteMany({
          where: { workspaceId },
        });
        await transaction.gitHubInstallation.deleteMany({
          where: { workspaceId },
        });
        await transaction.project.deleteMany({
          where: { workspaceId },
        });
        await transaction.workspace.delete({
          where: { id: workspaceId },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        WORKSPACE_DELETION_FAILED_MESSAGE,
      );
    }
  }
}
