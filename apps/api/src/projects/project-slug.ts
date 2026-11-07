import { randomBytes } from 'node:crypto';
import {
  PROJECT_SLUG_BASE_MAX_LENGTH,
  PROJECT_SLUG_SUFFIX_BYTES,
} from './project.constants';

export function createProjectSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PROJECT_SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
  const suffix = randomBytes(PROJECT_SLUG_SUFFIX_BYTES).toString('hex');

  return `${base || 'project'}-${suffix}`;
}
