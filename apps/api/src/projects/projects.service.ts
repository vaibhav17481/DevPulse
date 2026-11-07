import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { WORKSPACE_NOT_FOUND_MESSAGE } from '../workspaces/workspace.constants';
import type { WorkspaceRoleName } from '../workspaces/workspace.types';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import {
  PROJECT_CREATE_ROLES,
  PROJECT_CREATION_CONFLICT_MESSAGE,
  PROJECT_CREATION_FAILED_MESSAGE,
  PROJECT_CREATION_FORBIDDEN_MESSAGE,
  PROJECT_LIST_DEFAULT_LIMIT,
  PROJECT_LIST_DEFAULT_PAGE,
  PROJECT_LIST_FAILED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
  PROJECT_REPOSITORY_ARCHIVED_MESSAGE,
  PROJECT_REPOSITORY_GITHUB_ID_MAX,
  PROJECT_REPOSITORY_INVALID_MESSAGE,
  PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
  PROJECT_RETRIEVAL_FAILED_MESSAGE,
  PROJECT_UPDATE_EMPTY_MESSAGE,
  PROJECT_UPDATE_FAILED_MESSAGE,
  PROJECT_UPDATE_FORBIDDEN_MESSAGE,
  PROJECT_UPDATE_ROLES,
  PROJECT_DELETE_FORBIDDEN_MESSAGE,
  PROJECT_DELETE_ROLES,
  PROJECT_DELETION_FAILED_MESSAGE,
} from './project.constants';
import { createProjectSlug } from './project-slug';
import type {
  CreateProjectResponse,
  ProjectListResponse,
  ProjectRepositoryResponse,
  ProjectResponse,
  RepositoryConnectionStatusName,
  RepositoryVisibilityName,
} from './project.types';
import {
  GITHUB_REPOSITORY_RESOLVER,
  type GitHubRepositoryResolver,
} from './repository-resolver';

const PROJECT_DETAILS_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

const REPOSITORY_DETAILS_SELECT = {
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
} as const;

const PROJECT_WITH_REPOSITORY_SELECT = {
  ...PROJECT_DETAILS_SELECT,
  repository: {
    select: REPOSITORY_DETAILS_SELECT,
  },
} as const;

interface ProjectDetails {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RepositoryDetails {
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

interface ProjectListDetails extends ProjectDetails {
  repository: RepositoryDetails | null;
}

interface MembershipRole {
  role: WorkspaceRoleName;
}

function mapProjectFields(
  project: ProjectDetails,
): Omit<CreateProjectResponse, 'repository'> {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function mapRepository(
  repository: RepositoryDetails,
): ProjectRepositoryResponse {
  return {
    id: repository.id,
    githubId: repository.githubId.toString(),
    ownerLogin: repository.ownerLogin,
    name: repository.name,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    visibility: repository.visibility,
    isArchived: repository.isArchived,
    connectionStatus: repository.connectionStatus,
    connectedAt: repository.connectedAt,
    disconnectedAt: repository.disconnectedAt,
    lastSyncedAt: repository.lastSyncedAt,
  };
}

function mapProject(
  project: ProjectDetails,
  repository: RepositoryDetails,
): CreateProjectResponse {
  return {
    ...mapProjectFields(project),
    repository: mapRepository(repository),
  };
}

function mapProjectResponse(
  project: ProjectListDetails,
): ProjectResponse {
  return {
    ...mapProjectFields(project),
    repository: project.repository
      ? mapRepository(project.repository)
      : null,
  };
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    typeof (error as { code?: unknown }).code !== 'string'
  ) {
    return undefined;
  }

  return (error as { code: string }).code;
}

function parseRepositoryGithubId(value: string): bigint {
  let githubId: bigint;

  try {
    githubId = BigInt(value);
  } catch {
    throw new BadRequestException(PROJECT_REPOSITORY_INVALID_MESSAGE);
  }

  if (
    githubId <= 0n ||
    githubId > PROJECT_REPOSITORY_GITHUB_ID_MAX ||
    githubId.toString() !== value
  ) {
    throw new BadRequestException(PROJECT_REPOSITORY_INVALID_MESSAGE);
  }

  return githubId;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(GITHUB_REPOSITORY_RESOLVER)
    private readonly repositoryResolver: GitHubRepositoryResolver,
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    dto: CreateProjectDto,
  ): Promise<CreateProjectResponse> {
    const githubId = parseRepositoryGithubId(dto.repositoryGithubId);

    try {
      const membership =
        await this.database.client.workspaceMember.findFirst({
          where: { userId, workspaceId },
          select: { role: true },
        });

      this.assertCanCreateProject(membership);

      const existingRepository =
        await this.database.client.repository.findUnique({
          where: { githubId },
          select: { id: true },
        });

      if (existingRepository) {
        throw new ConflictException(
          PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
        );
      }

      const resolvedRepository =
        await this.repositoryResolver.resolve(workspaceId, githubId);

      if (resolvedRepository.githubId !== githubId) {
        throw new NotFoundException(
          PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
        );
      }

      if (resolvedRepository.isArchived) {
        throw new BadRequestException(
          PROJECT_REPOSITORY_ARCHIVED_MESSAGE,
        );
      }

      return await this.database.client.$transaction(
        async (transaction) => {
          const currentMembership =
            await transaction.workspaceMember.findFirst({
              where: { userId, workspaceId },
              select: { role: true },
            });

          this.assertCanCreateProject(currentMembership);

          const duplicateRepository =
            await transaction.repository.findUnique({
              where: { githubId },
              select: { id: true },
            });

          if (duplicateRepository) {
            throw new ConflictException(
              PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE,
            );
          }

          const installation =
            await transaction.gitHubInstallation.findFirst({
              where: {
                id: resolvedRepository.installationId,
                workspaceId,
                status: 'ACTIVE',
              },
              select: { id: true },
            });

          if (!installation) {
            throw new NotFoundException(
              PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
            );
          }

          const project = await transaction.project.create({
            data: {
              workspaceId,
              name: dto.name,
              slug: createProjectSlug(dto.name),
              description: dto.description ?? null,
            },
            select: PROJECT_DETAILS_SELECT,
          });

          const repository = await transaction.repository.create({
            data: {
              workspaceId,
              projectId: project.id,
              installationId: resolvedRepository.installationId,
              githubId,
              ownerLogin: resolvedRepository.ownerLogin,
              name: resolvedRepository.name,
              fullName: resolvedRepository.fullName,
              defaultBranch: resolvedRepository.defaultBranch,
              visibility: resolvedRepository.visibility,
              isArchived: resolvedRepository.isArchived,
              connectionStatus: 'ACTIVE',
            },
            select: REPOSITORY_DETAILS_SELECT,
          });

          return mapProject(project, repository);
        },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const databaseErrorCode = getDatabaseErrorCode(error);

      if (databaseErrorCode === 'P2002') {
        throw new ConflictException(
          PROJECT_CREATION_CONFLICT_MESSAGE,
        );
      }

      if (databaseErrorCode === 'P2003') {
        throw new NotFoundException(
          PROJECT_REPOSITORY_NOT_FOUND_MESSAGE,
        );
      }

      throw new InternalServerErrorException(
        PROJECT_CREATION_FAILED_MESSAGE,
      );
    }
  }

  async list(
    userId: string,
    workspaceId: string,
    query: ListProjectsQueryDto,
  ): Promise<ProjectListResponse> {
    const page = query.page ?? PROJECT_LIST_DEFAULT_PAGE;
    const limit = query.limit ?? PROJECT_LIST_DEFAULT_LIMIT;

    try {
      const membership =
        await this.database.client.workspaceMember.findFirst({
          where: { userId, workspaceId },
          select: { id: true },
        });

      if (!membership) {
        throw new NotFoundException(WORKSPACE_NOT_FOUND_MESSAGE);
      }

      const where = { workspaceId };
      const [projects, total] = await Promise.all([
        this.database.client.project.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          select: PROJECT_WITH_REPOSITORY_SELECT,
        }),
        this.database.client.project.count({ where }),
      ]);

      return {
        items: projects.map((project) =>
          mapProjectResponse(project),
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
        PROJECT_LIST_FAILED_MESSAGE,
      );
    }
  }

  async get(
    userId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    try {
      const membership =
        await this.database.client.workspaceMember.findFirst({
          where: { userId, workspaceId },
          select: { id: true },
        });

      if (!membership) {
        throw new NotFoundException(WORKSPACE_NOT_FOUND_MESSAGE);
      }

      const project = await this.database.client.project.findFirst({
        where: { id: projectId, workspaceId },
        select: PROJECT_WITH_REPOSITORY_SELECT,
      });

      if (!project) {
        throw new NotFoundException(PROJECT_NOT_FOUND_MESSAGE);
      }

      return mapProjectResponse(project);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        PROJECT_RETRIEVAL_FAILED_MESSAGE,
      );
    }
  }

  async update(
    userId: string,
    workspaceId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException(PROJECT_UPDATE_EMPTY_MESSAGE);
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
            throw new NotFoundException(
              WORKSPACE_NOT_FOUND_MESSAGE,
            );
          }

          if (
            !(
              PROJECT_UPDATE_ROLES as readonly WorkspaceRoleName[]
            ).includes(membership.role)
          ) {
            throw new ForbiddenException(
              PROJECT_UPDATE_FORBIDDEN_MESSAGE,
            );
          }

          const project = await transaction.project.update({
            where: {
              id_workspaceId: { id: projectId, workspaceId },
            },
            data: {
              ...(dto.name !== undefined ? { name: dto.name } : {}),
              ...(dto.description !== undefined
                ? { description: dto.description }
                : {}),
            },
            select: PROJECT_WITH_REPOSITORY_SELECT,
          });

          return mapProjectResponse(project);
        },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (getDatabaseErrorCode(error) === 'P2025') {
        throw new NotFoundException(PROJECT_NOT_FOUND_MESSAGE);
      }

      throw new InternalServerErrorException(
        PROJECT_UPDATE_FAILED_MESSAGE,
      );
    }
  }


  async delete(
    userId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
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

        if (
          !(PROJECT_DELETE_ROLES as readonly WorkspaceRoleName[]).includes(
            membership.role,
          )
        ) {
          throw new ForbiddenException(
            PROJECT_DELETE_FORBIDDEN_MESSAGE,
          );
        }

        const project = await transaction.project.findFirst({
          where: { id: projectId, workspaceId },
          select: { id: true },
        });

        if (!project) {
          throw new NotFoundException(PROJECT_NOT_FOUND_MESSAGE);
        }

        const repository = await transaction.repository.findFirst({
          where: { projectId, workspaceId },
          select: { id: true },
        });
        const repositoryId = repository?.id;

        if (repositoryId) {
          await transaction.webhookEvent.deleteMany({
            where: { repositoryId },
          });
        }

        await transaction.recommendation.deleteMany({
          where: { projectId, workspaceId },
        });
        await transaction.riskAssessment.deleteMany({
          where: { projectId, workspaceId },
        });

        if (repositoryId) {
          await transaction.workflowRun.deleteMany({
            where: { repositoryId, workspaceId },
          });
          await transaction.issue.deleteMany({
            where: { repositoryId, workspaceId },
          });
          await transaction.pullRequest.deleteMany({
            where: { repositoryId, workspaceId },
          });
          await transaction.repository.deleteMany({
            where: { id: repositoryId, projectId, workspaceId },
          });
        }

        await transaction.project.delete({
          where: {
            id_workspaceId: { id: projectId, workspaceId },
          },
        });
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (getDatabaseErrorCode(error) === 'P2025') {
        throw new NotFoundException(PROJECT_NOT_FOUND_MESSAGE);
      }

      throw new InternalServerErrorException(
        PROJECT_DELETION_FAILED_MESSAGE,
      );
    }
  }

  private assertCanCreateProject(
    membership: MembershipRole | null,
  ): void {
    if (!membership) {
      throw new NotFoundException(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    if (
      !(PROJECT_CREATE_ROLES as readonly WorkspaceRoleName[]).includes(
        membership.role,
      )
    ) {
      throw new ForbiddenException(
        PROJECT_CREATION_FORBIDDEN_MESSAGE,
      );
    }
  }
}
