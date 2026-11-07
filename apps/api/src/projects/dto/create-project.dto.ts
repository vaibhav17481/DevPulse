import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_REPOSITORY_GITHUB_ID_MAX_LENGTH,
} from '../project.constants';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateProjectDto {
  @Transform(({ value }: TransformFnParams): unknown => trimString(value))
  @IsString()
  @Length(1, PROJECT_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => trimString(value))
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @Transform(({ value }: TransformFnParams): unknown => trimString(value))
  @IsString()
  @Length(1, PROJECT_REPOSITORY_GITHUB_ID_MAX_LENGTH)
  @Matches(/^[1-9]\d*$/)
  repositoryGithubId!: string;
}
