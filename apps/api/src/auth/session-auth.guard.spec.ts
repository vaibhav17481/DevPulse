import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './auth.types';
import {
  AUTHENTICATION_REQUIRED_MESSAGE,
  SessionAuthGuard,
} from './session-auth.guard';
import { SessionService } from './session.service';

describe('SessionAuthGuard', () => {
  let validate: jest.MockedFunction<
    (token: string) => Promise<AuthenticatedUser | null>
  >;
  let guard: SessionAuthGuard;

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
  };

  beforeEach(() => {
    validate = jest.fn();
    guard = new SessionAuthGuard({
      validate,
    } as unknown as SessionService);
  });

  function createContext(cookieHeader?: string): {
    context: ExecutionContext;
    request: AuthenticatedRequest;
  } {
    const request = {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    } as AuthenticatedRequest;

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('rejects a request without a session cookie', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(validate).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous cookie header without a database query', async () => {
    const { context } = createContext(
      'devpulse_session=first; devpulse_session=second',
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(validate).not.toHaveBeenCalled();
  });

  it('rejects a token that fails validation', async () => {
    validate.mockResolvedValue(null);
    const { context } = createContext('devpulse_session=invalid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      AUTHENTICATION_REQUIRED_MESSAGE,
    );
    expect(validate).toHaveBeenCalledWith('invalid-token');
  });

  it('attaches the safe user identity for a valid session', async () => {
    validate.mockResolvedValue(user);
    const { context, request } = createContext(
      'devpulse_session=valid-token',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(validate).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual(user);
  });

  it('does not hide unexpected validation failures', async () => {
    validate.mockRejectedValue(new Error('database unavailable'));
    const { context } = createContext('devpulse_session=valid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      'database unavailable',
    );
  });
});
