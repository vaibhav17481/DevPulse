import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  LoginResult,
  RegisterResponse,
} from './auth.types';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { normalizeEmail } from './email';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

const DUPLICATE_EMAIL_MESSAGE =
  'An account with this email already exists.';
const REGISTRATION_FAILED_MESSAGE = 'Unable to register user.';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const LOGIN_FAILED_MESSAGE = 'Unable to log in.';

// Used only to equalize password verification timing for unknown accounts.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$tLIgXx1h+/keQTHEt9HTkw$KvJ78keMAoIaR1HzyfDmyEYizNTjuDlTRh0rTxr8ss8';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    try {
      const email = normalizeEmail(dto.email);
      const user = await this.database.client.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true },
      });

      const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
      const passwordMatches = await this.passwordService.verify(
        passwordHash,
        dto.password,
      );

      if (
        !user ||
        !user.email ||
        !user.passwordHash ||
        !passwordMatches
      ) {
        throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
      }

      const session = await this.sessionService.create(user.id);

      return {
        user: { id: user.id, email: user.email },
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(LOGIN_FAILED_MESSAGE);
    }
  }

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    try {
      const email = normalizeEmail(dto.email);
      const existingUser = await this.database.client.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }

      const passwordHash = await this.passwordService.hash(dto.password);
      const user = await this.database.client.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true },
      });

      if (!user.email) {
        throw new InternalServerErrorException(REGISTRATION_FAILED_MESSAGE);
      }

      return { id: user.id, email: user.email };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }

      throw new InternalServerErrorException(REGISTRATION_FAILED_MESSAGE);
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
