import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  WORKSPACE_LIST_DEFAULT_PAGE,
  WORKSPACE_LIST_MAX_LIMIT,
} from '../workspace.constants';

export class ListWorkspacesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(WORKSPACE_LIST_DEFAULT_PAGE)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WORKSPACE_LIST_MAX_LIMIT)
  limit?: number;
}
