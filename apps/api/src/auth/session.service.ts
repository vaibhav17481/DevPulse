import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { AuthenticatedUser } from './auth.types';
import { SESSION_TTL_MS } from './session.constants';
import {
  generateSessionToken,
  hashSessionToken,
  isValidSessionTokenFormat,
} from './session-token';

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, now: Date = new Date()): Promise<CreatedSession> {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    await this.database.client.session.create({
      data: { userId, tokenHash, expiresAt },
      select: { id: true },
    });

    return { token, expiresAt };
  }

  async validate(
    token: string,
    now: Date = new Date(),
  ): Promise<AuthenticatedUser | null> {
    if (!isValidSessionTokenFormat(token)) {
      return null;
    }

    const session = await this.database.client.session.findUnique({
      where: {
        tokenHash: hashSessionToken(token),
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        user: {
          select: { id: true, email: true },
        },
      },
    });

    return session?.user ?? null;
  }

  async revoke(token: string, now: Date = new Date()): Promise<void> {
    if (!isValidSessionTokenFormat(token)) {
      return;
    }

    await this.database.client.session.updateMany({
      where: {
        tokenHash: hashSessionToken(token),
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  }
}
