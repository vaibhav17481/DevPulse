export type RepositoryVisibilityName =
  | 'PUBLIC'
  | 'PRIVATE'
  | 'INTERNAL';

export type RepositoryConnectionStatusName =
  | 'ACTIVE'
  | 'DISCONNECTED';

export interface ProjectRepositoryResponse {
  id: string;
  githubId: string;
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

export interface ProjectResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  repository: ProjectRepositoryResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectResponse extends ProjectResponse {
  repository: ProjectRepositoryResponse;
}

export interface ProjectListPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProjectListResponse {
  items: ProjectResponse[];
  pagination: ProjectListPagination;
}
