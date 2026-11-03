export type WorkspaceRoleName = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface CreateWorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: WorkspaceRoleName;
  createdAt: Date;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: WorkspaceRoleName;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceListPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WorkspaceListResponse {
  items: WorkspaceResponse[];
  pagination: WorkspaceListPagination;
}
