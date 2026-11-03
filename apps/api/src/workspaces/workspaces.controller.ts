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
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { ListWorkspacesQueryDto } from './dto/list-workspaces-query.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import type {
  CreateWorkspaceResponse,
  WorkspaceListResponse,
  WorkspaceResponse,
} from './workspace.types';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<CreateWorkspaceResponse> {
    return this.workspacesService.create(request.user.id, dto);
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListWorkspacesQueryDto,
  ): Promise<WorkspaceListResponse> {
    return this.workspacesService.list(request.user.id, query);
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<WorkspaceResponse> {
    return this.workspacesService.get(request.user.id, id);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponse> {
    return this.workspacesService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard)
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.workspacesService.delete(request.user.id, id);
  }
}
