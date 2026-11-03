import type { CookieOptions } from 'express';
import { SESSION_COOKIE_NAME } from './session.constants';

export function getSessionTokenFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const values: string[] = [];

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();

    if (name === SESSION_COOKIE_NAME) {
      values.push(part.slice(separator + 1).trim());
    }
  }

  return values.length === 1 && values[0] ? values[0] : null;
}

export function createSessionCookieOptions(
  expiresAt: Date,
  now: Date = new Date(),
  isProduction: boolean = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: Math.max(0, expiresAt.getTime() - now.getTime()),
  };
}

export function createSessionCookieClearOptions(
  isProduction: boolean = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}
