import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types';
import { getSessionTokenFromCookieHeader } from './session-cookie';
import { SessionService } from './session.service';

export const AUTHENTICATION_REQUIRED_MESSAGE = 'Authentication required.';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const token = getSessionTokenFromCookieHeader(
      request.headers.cookie,
    );

    if (!token) {
      throw new UnauthorizedException(AUTHENTICATION_REQUIRED_MESSAGE);
    }

    const user = await this.sessionService.validate(token);

    if (!user) {
      throw new UnauthorizedException(AUTHENTICATION_REQUIRED_MESSAGE);
    }

    request.user = user;

    return true;
  }
}
