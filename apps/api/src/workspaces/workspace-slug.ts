import { randomBytes } from 'node:crypto';
import {
  WORKSPACE_SLUG_BASE_MAX_LENGTH,
  WORKSPACE_SLUG_SUFFIX_BYTES,
} from './workspace.constants';

export function createWorkspaceSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, WORKSPACE_SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
  const suffix = randomBytes(WORKSPACE_SLUG_SUFFIX_BYTES).toString('hex');

  return `${base || 'workspace'}-${suffix}`;
}
