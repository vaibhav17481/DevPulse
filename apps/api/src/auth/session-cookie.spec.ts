import {
  createSessionCookieClearOptions,
  createSessionCookieOptions,
  getSessionTokenFromCookieHeader,
} from './session-cookie';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from './session.constants';

describe('createSessionCookieOptions', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  it('creates a path-scoped, HttpOnly, Lax cookie in development', () => {
    const options = createSessionCookieOptions(expiresAt, now, false);

    expect(options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: SESSION_TTL_MS,
    });
  });

  it('enables Secure in production', () => {
    const options = createSessionCookieOptions(expiresAt, now, true);

    expect(options.secure).toBe(true);
  });

  it('never returns a negative max age', () => {
    const options = createSessionCookieOptions(
      new Date(now.getTime() - 1),
      now,
      false,
    );

    expect(options.maxAge).toBe(0);
  });
});

describe('getSessionTokenFromCookieHeader', () => {
  it('extracts the session token from a single cookie', () => {
    expect(
      getSessionTokenFromCookieHeader(`${SESSION_COOKIE_NAME}=abc123`),
    ).toBe('abc123');
  });

  it('extracts from a cookie header with other cookies', () => {
    expect(
      getSessionTokenFromCookieHeader(
        `theme=light; ${SESSION_COOKIE_NAME}=token-value; other=test`,
      ),
    ).toBe('token-value');
  });

  it('returns null for missing or malformed headers', () => {
    expect(getSessionTokenFromCookieHeader(undefined)).toBeNull();
    expect(getSessionTokenFromCookieHeader('')).toBeNull();
    expect(getSessionTokenFromCookieHeader('theme=light')).toBeNull();
    expect(getSessionTokenFromCookieHeader(`${SESSION_COOKIE_NAME}=`)).toBeNull();
    expect(
      getSessionTokenFromCookieHeader(
        `${SESSION_COOKIE_NAME}=a; ${SESSION_COOKIE_NAME}=b`,
      ),
    ).toBeNull();
  });
});

describe('createSessionCookieClearOptions', () => {
  it('clears the cookie with the same path and policy', () => {
    expect(createSessionCookieClearOptions(false)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('clears securely in production', () => {
    expect(createSessionCookieClearOptions(true).secure).toBe(true);
  });
});
