import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE } from './project.constants';
import type { RepositoryVisibilityName } from './project.types';

export const GITHUB_REPOSITORY_RESOLVER = Symbol(
  'GITHUB_REPOSITORY_RESOLVER',
);

export interface ResolvedGitHubRepository {
  githubId: bigint;
  installationId: string;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  visibility: RepositoryVisibilityName;
  isArchived: boolean;
}

export interface GitHubRepositoryResolver {
  resolve(
    workspaceId: string,
    githubId: bigint,
  ): Promise<ResolvedGitHubRepository>;
}

@Injectable()
export class UnavailableGitHubRepositoryResolver
  implements GitHubRepositoryResolver
{
  resolve(
    workspaceId: string,
    githubId: bigint,
  ): Promise<ResolvedGitHubRepository> {
    void workspaceId;
    void githubId;

    return Promise.reject(
      new ServiceUnavailableException(
        PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE,
      ),
    );
  }
}
