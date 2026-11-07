export const PROJECT_NAME_MAX_LENGTH = 255;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;
export const PROJECT_SLUG_BASE_MAX_LENGTH = 80;
export const PROJECT_SLUG_SUFFIX_BYTES = 4;
export const PROJECT_REPOSITORY_GITHUB_ID_MAX_LENGTH = 19;
export const PROJECT_REPOSITORY_GITHUB_ID_MAX = 9223372036854775807n;
export const PROJECT_CREATE_ROLES = ['OWNER', 'ADMIN'] as const;
export const PROJECT_UPDATE_ROLES = ['OWNER', 'ADMIN'] as const;
export const PROJECT_LIST_DEFAULT_PAGE = 1;
export const PROJECT_LIST_DEFAULT_LIMIT = 20;
export const PROJECT_LIST_MAX_LIMIT = 100;
export const PROJECT_LIST_FAILED_MESSAGE = 'Unable to list projects.';
export const PROJECT_NOT_FOUND_MESSAGE = 'Project not found.';
export const PROJECT_RETRIEVAL_FAILED_MESSAGE =
  'Unable to retrieve project.';
export const PROJECT_UPDATE_EMPTY_MESSAGE =
  'At least one of name or description must be provided.';
export const PROJECT_UPDATE_FORBIDDEN_MESSAGE =
  'You do not have permission to update projects in this workspace.';
export const PROJECT_UPDATE_FAILED_MESSAGE = 'Unable to update project.';
export const PROJECT_CREATION_FAILED_MESSAGE = 'Unable to create project.';
export const PROJECT_CREATION_FORBIDDEN_MESSAGE =
  'You do not have permission to create projects in this workspace.';
export const PROJECT_CREATION_CONFLICT_MESSAGE =
  'Project could not be created because a unique value is already in use.';
export const PROJECT_REPOSITORY_INVALID_MESSAGE =
  'Repository GitHub ID is invalid.';
export const PROJECT_REPOSITORY_ALREADY_CONNECTED_MESSAGE =
  'Repository is already connected to a project.';
export const PROJECT_REPOSITORY_ARCHIVED_MESSAGE =
  'Archived repositories cannot be connected to a project.';
export const PROJECT_REPOSITORY_NOT_FOUND_MESSAGE = 'Repository not found.';
export const PROJECT_REPOSITORY_RESOLUTION_UNAVAILABLE_MESSAGE =
  'GitHub repository verification is not available.';

export const PROJECT_DELETE_ROLES = ['OWNER', 'ADMIN'] as const;
export const PROJECT_DELETE_FORBIDDEN_MESSAGE =
  'You do not have permission to delete this project.';
export const PROJECT_DELETION_FAILED_MESSAGE = 'Unable to delete project.';
