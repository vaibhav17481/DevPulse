import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

interface FindUniqueArguments {
  where: { email: string };
  select: { id?: true; email?: true; passwordHash?: true };
}

interface FoundUser {
  id: string;
  email?: string | null;
  passwordHash?: string | null;
}

interface RegisterCreateArguments {
  data: { email: string; passwordHash: string };
  select: { id: true; email: true };
}

interface CreatedUser {
  id: string;
  email: string | null;
}

describe('AuthService', () => {
  let service: AuthService;
  let findUnique: jest.MockedFunction<
    (arguments_: FindUniqueArguments) => Promise<FoundUser | null>
  >;
  let createUser: jest.MockedFunction<
    (arguments_: RegisterCreateArguments) => Promise<CreatedUser>
  >;
  let hashPassword: jest.MockedFunction<
    (password: string) => Promise<string>
  >;
  let verifyPassword: jest.MockedFunction<
    (passwordHash: string, password: string) => Promise<boolean>
  >;
  let createSession: jest.MockedFunction<
    (userId: string) => Promise<{ token: string; expiresAt: Date }>
  >;

  const registerDto: RegisterDto = {
    email: '  User@Example.COM ',
    password: 'ValidPass123',
  };

  const loginDto: LoginDto = {
    email: '  User@Example.COM ',
    password: 'ValidPass123',
  };

  beforeEach(async () => {
    findUnique = jest.fn();
    createUser = jest.fn();
    hashPassword = jest.fn();
    verifyPassword = jest.fn();
    createSession = jest.fn();

    const database = {
      client: { user: { findUnique, create: createUser } },
    } as unknown as DatabaseService;

    const passwordService = {
      hash: hashPassword,
      verify: verifyPassword,
    } as unknown as PasswordService;

    const sessionService = {
      create: createSession,
    } as unknown as SessionService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: database },
        { provide: PasswordService, useValue: passwordService },
        { provide: SessionService, useValue: sessionService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('registers a normalized email with a password hash', async () => {
      findUnique.mockResolvedValue(null);
      hashPassword.mockResolvedValue('$argon2id$stored-hash');
      createUser.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });

      await expect(service.register(registerDto)).resolves.toEqual({
        id: 'user-1',
        email: 'user@example.com',
      });

      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        select: { id: true },
      });
      expect(hashPassword).toHaveBeenCalledWith('ValidPass123');
      expect(createUser).toHaveBeenCalledWith({
        data: {
          email: 'user@example.com',
          passwordHash: '$argon2id$stored-hash',
        },
        select: { id: true, email: true },
      });
    });

    it('does not store or return the plaintext password', async () => {
      findUnique.mockResolvedValue(null);
      hashPassword.mockResolvedValue('$argon2id$stored-hash');
      createUser.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });

      const response = await service.register(registerDto);
      const createArguments = createUser.mock.calls[0]?.[0];

      expect(createArguments?.data).not.toHaveProperty('password');
      expect(createArguments?.data.passwordHash).toBe(
        '$argon2id$stored-hash',
      );
      expect(JSON.stringify(response)).not.toContain('ValidPass123');
      expect(JSON.stringify(response)).not.toContain(
        '$argon2id$stored-hash',
      );
    });

    it('rejects an existing email before hashing the password', async () => {
      findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(hashPassword).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
    });

    it('maps a unique constraint race to a conflict response', async () => {
      findUnique.mockResolvedValue(null);
      hashPassword.mockResolvedValue('$argon2id$stored-hash');
      createUser.mockRejectedValue({ code: 'P2002' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'An account with this email already exists.',
      );
    });

    it('returns a generic error for unexpected database failures', async () => {
      findUnique.mockResolvedValue(null);
      hashPassword.mockResolvedValue('$argon2id$stored-hash');
      createUser.mockRejectedValue(new Error('database unavailable'));

      await expect(service.register(registerDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'Unable to register user.',
      );
    });
  });

  describe('login', () => {
    const storedUser: FoundUser = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: '$argon2id$stored-hash',
    };
    const expiresAt = new Date('2026-11-09T12:00:00.000Z');

    it('returns only the user and an internal session token', async () => {
      findUnique.mockResolvedValue(storedUser);
      verifyPassword.mockResolvedValue(true);
      createSession.mockResolvedValue({
        token: 'raw-session-token',
        expiresAt,
      });

      await expect(service.login(loginDto)).resolves.toEqual({
        user: { id: 'user-1', email: 'user@example.com' },
        sessionToken: 'raw-session-token',
        sessionExpiresAt: expiresAt,
      });

      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        select: { id: true, email: true, passwordHash: true },
      });
      expect(verifyPassword).toHaveBeenCalledWith(
        '$argon2id$stored-hash',
        'ValidPass123',
      );
      expect(createSession).toHaveBeenCalledWith('user-1');
    });

    it('rejects an incorrect password with a generic error', async () => {
      findUnique.mockResolvedValue(storedUser);
      verifyPassword.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid email or password.',
      );
      expect(createSession).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the same generic error', async () => {
      findUnique.mockResolvedValue(null);
      verifyPassword.mockResolvedValue(false);

      const loginPromise = service.login(loginDto);

      await expect(loginPromise).rejects.toThrow(UnauthorizedException);
      await expect(loginPromise).rejects.toThrow(
        'Invalid email or password.',
      );
      expect(verifyPassword).toHaveBeenCalledTimes(1);
      expect(createSession).not.toHaveBeenCalled();
    });

    it('rejects an account without a password hash safely', async () => {
      findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: null,
      });
      verifyPassword.mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid email or password.',
      );
      expect(createSession).not.toHaveBeenCalled();
    });

    it('returns a generic error for unexpected lookup failures', async () => {
      findUnique.mockRejectedValue(new Error('database unavailable'));

      await expect(service.login(loginDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Unable to log in.',
      );
      expect(verifyPassword).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    });

    it('returns a generic error for unexpected session failures', async () => {
      findUnique.mockResolvedValue(storedUser);
      verifyPassword.mockResolvedValue(true);
      createSession.mockRejectedValue(new Error('database unavailable'));

      await expect(service.login(loginDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Unable to log in.',
      );
    });
  });
});
