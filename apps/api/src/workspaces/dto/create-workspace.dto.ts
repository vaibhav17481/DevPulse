import { Transform, type TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import {
  WORKSPACE_DESCRIPTION_MAX_LENGTH,
  WORKSPACE_NAME_MAX_LENGTH,
} from '../workspace.constants';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateWorkspaceDto {
  @Transform(({ value }: TransformFnParams): unknown => trimString(value))
  @IsString()
  @Length(1, WORKSPACE_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => trimString(value))
  @IsString()
  @MaxLength(WORKSPACE_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}
