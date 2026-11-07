import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import type {
  CreateProjectResponse,
  ProjectListResponse,
  ProjectResponse,
} from './project.types';
import { ProjectsService } from './projects.service';

@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  list(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Query() query: ListProjectsQueryDto,
  ): Promise<ProjectListResponse> {
    return this.projectsService.list(
      request.user.id,
      workspaceId,
      query,
    );
  }

  @Get(':projectId')
  @UseGuards(SessionAuthGuard)
  get(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<ProjectResponse> {
    return this.projectsService.get(
      request.user.id,
      workspaceId,
      projectId,
    );
  }

  @Patch(':projectId')
  @UseGuards(SessionAuthGuard)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projectsService.update(
      request.user.id,
      workspaceId,
      projectId,
      dto,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() dto: CreateProjectDto,
  ): Promise<CreateProjectResponse> {
    return this.projectsService.create(
      request.user.id,
      workspaceId,
      dto,
    );
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard)
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<void> {
    return this.projectsService.delete(
      request.user.id,
      workspaceId,
      projectId,
    );
  }
}
