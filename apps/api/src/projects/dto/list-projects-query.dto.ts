import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  PROJECT_LIST_DEFAULT_PAGE,
  PROJECT_LIST_MAX_LIMIT,
} from '../project.constants';

export class ListProjectsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PROJECT_LIST_DEFAULT_PAGE)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PROJECT_LIST_MAX_LIMIT)
  limit?: number;
}
