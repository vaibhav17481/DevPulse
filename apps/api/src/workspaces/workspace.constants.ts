export const WORKSPACE_NAME_MAX_LENGTH = 255;
export const WORKSPACE_DESCRIPTION_MAX_LENGTH = 2000;
export const WORKSPACE_SLUG_BASE_MAX_LENGTH = 80;
export const WORKSPACE_SLUG_SUFFIX_BYTES = 4;
export const WORKSPACE_OWNER_ROLE = 'OWNER' as const;
export const WORKSPACE_ADMIN_ROLE = 'ADMIN' as const;
export const WORKSPACE_UPDATE_ROLES = [
  WORKSPACE_OWNER_ROLE,
  WORKSPACE_ADMIN_ROLE,
] as const;
export const WORKSPACE_LIST_DEFAULT_PAGE = 1;
export const WORKSPACE_LIST_DEFAULT_LIMIT = 20;
export const WORKSPACE_LIST_MAX_LIMIT = 100;
export const WORKSPACE_CREATION_FAILED_MESSAGE =
  'Unable to create workspace.';
export const WORKSPACE_LIST_FAILED_MESSAGE = 'Unable to list workspaces.';
export const WORKSPACE_RETRIEVAL_FAILED_MESSAGE =
  'Unable to retrieve workspace.';
export const WORKSPACE_UPDATE_FAILED_MESSAGE =
  'Unable to update workspace.';
export const WORKSPACE_UPDATE_EMPTY_MESSAGE =
  'At least one of name or description must be provided.';
export const WORKSPACE_UPDATE_FORBIDDEN_MESSAGE =
  'You do not have permission to update this workspace.';
export const WORKSPACE_DELETION_FAILED_MESSAGE =
  'Unable to delete workspace.';
export const WORKSPACE_DELETE_FORBIDDEN_MESSAGE =
  'You do not have permission to delete this workspace.';
export const WORKSPACE_NOT_FOUND_MESSAGE = 'Workspace not found.';
