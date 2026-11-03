import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function parseCorsAllowedOrigins(
  value: string | undefined,
): string[] {
  if (!value) {
    return [];
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const normalizedOrigins = origins.map((origin) => {
    if (origin === '*') {
      throw new Error(
        'CORS_ALLOWED_ORIGINS must not contain a wildcard origin.',
      );
    }

    let parsed: URL;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        `CORS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`,
      );
    }

    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== '/' && parsed.pathname !== '')
    ) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`,
      );
    }

    return parsed.origin;
  });

  return [...new Set(normalizedOrigins)];
}

export function getCorsOptions(
  value: string | undefined = process.env.CORS_ALLOWED_ORIGINS,
): CorsOptions | undefined {
  const origins = parseCorsAllowedOrigins(value);

  if (origins.length === 0) {
    return undefined;
  }

  return { origin: origins, credentials: true };
}
