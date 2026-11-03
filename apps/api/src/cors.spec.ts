import { getCorsOptions, parseCorsAllowedOrigins } from './cors';

describe('CORS configuration', () => {
  it('parses, normalizes, and deduplicates trusted origins', () => {
    expect(
      parseCorsAllowedOrigins(
        ' http://localhost:3000/ , https://app.example.com,http://localhost:3000 ',
      ),
    ).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });

  it('returns no origins when configuration is empty', () => {
    expect(parseCorsAllowedOrigins(undefined)).toEqual([]);
    expect(parseCorsAllowedOrigins('  ,  ')).toEqual([]);
    expect(getCorsOptions(undefined)).toBeUndefined();
    expect(getCorsOptions('')).toBeUndefined();
  });

  it('enables credentials for explicitly configured origins', () => {
    expect(getCorsOptions('https://app.example.com')).toEqual({
      origin: ['https://app.example.com'],
      credentials: true,
    });
  });

  it('rejects wildcard origins', () => {
    expect(() => parseCorsAllowedOrigins('*')).toThrow(
      'CORS_ALLOWED_ORIGINS must not contain a wildcard origin.',
    );
    expect(() =>
      parseCorsAllowedOrigins('https://app.example.com,*'),
    ).toThrow(
      'CORS_ALLOWED_ORIGINS must not contain a wildcard origin.',
    );
  });

  it('rejects invalid or non-origin values', () => {
    expect(() => parseCorsAllowedOrigins('not-a-url')).toThrow(
      'CORS_ALLOWED_ORIGINS contains an invalid origin: not-a-url',
    );
    expect(() =>
      parseCorsAllowedOrigins('https://app.example.com/path'),
    ).toThrow('CORS_ALLOWED_ORIGINS contains an invalid origin');
    expect(() =>
      parseCorsAllowedOrigins('ftp://app.example.com'),
    ).toThrow('CORS_ALLOWED_ORIGINS contains an invalid origin');
    expect(() =>
      parseCorsAllowedOrigins('https://user:pass@app.example.com'),
    ).toThrow('CORS_ALLOWED_ORIGINS contains an invalid origin');
  });
});
