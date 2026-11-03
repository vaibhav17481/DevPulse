import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  AuthUserResponse,
  AuthenticatedRequest,
  AuthenticatedUser,
  RegisterResponse,
} from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './session-auth.guard';
import {
  createSessionCookieClearOptions,
  createSessionCookieOptions,
  getSessionTokenFromCookieHeader,
} from './session-cookie';
import { SESSION_COOKIE_NAME } from './session.constants';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const result = await this.authService.login(dto);

    response.cookie(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      createSessionCookieOptions(result.sessionExpiresAt),
    );

    return result.user;
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    return this.authService.register(dto);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@Req() request: AuthenticatedRequest): AuthenticatedUser {
    return request.user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = getSessionTokenFromCookieHeader(cookieHeader);

    if (token) {
      await this.sessionService.revoke(token);
    }

    response.clearCookie(
      SESSION_COOKIE_NAME,
      createSessionCookieClearOptions(),
    );
  }
}
