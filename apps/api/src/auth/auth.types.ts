import type { Request } from 'express';

export interface RegisterResponse {
  id: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

export interface AuthUserResponse {
  id: string;
  email: string;
}

export interface LoginResult {
  user: AuthUserResponse;
  sessionToken: string;
  sessionExpiresAt: Date;
}
