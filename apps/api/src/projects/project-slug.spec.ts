import { createProjectSlug } from './project-slug';

describe('createProjectSlug', () => {
  it('builds a readable lowercase slug with a random suffix', () => {
    expect(createProjectSlug('  Checkout API!  ')).toMatch(
      /^checkout-api-[a-f0-9]{8}$/,
    );
  });

  it('normalizes accents and separators', () => {
    expect(createProjectSlug('Café déjà vu')).toMatch(
      /^cafe-deja-vu-[a-f0-9]{8}$/,
    );
  });

  it('falls back when the name has no latin alphanumeric characters', () => {
    expect(createProjectSlug('!!!')).toMatch(
      /^project-[a-f0-9]{8}$/,
    );
  });

  it('keeps the slug within the schema length limit', () => {
    const slug = createProjectSlug('A'.repeat(255));

    expect(slug).toMatch(/^a{80}-[a-f0-9]{8}$/);
    expect(slug).toHaveLength(89);
  });
});
