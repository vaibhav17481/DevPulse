import { createWorkspaceSlug } from './workspace-slug';

describe('createWorkspaceSlug', () => {
  it('builds a readable lowercase slug with a random suffix', () => {
    expect(createWorkspaceSlug('  My Cool Workspace!  ')).toMatch(
      /^my-cool-workspace-[a-f0-9]{8}$/,
    );
  });

  it('normalizes accents and separators', () => {
    expect(createWorkspaceSlug('Café déjà vu')).toMatch(
      /^cafe-deja-vu-[a-f0-9]{8}$/,
    );
  });

  it('falls back when the name has no latin alphanumeric characters', () => {
    expect(createWorkspaceSlug('!!!')).toMatch(
      /^workspace-[a-f0-9]{8}$/,
    );
  });

  it('keeps the slug within the schema length limit', () => {
    const slug = createWorkspaceSlug('A'.repeat(255));

    expect(slug).toMatch(/^a{80}-[a-f0-9]{8}$/);
    expect(slug).toHaveLength(89);
  });
});
