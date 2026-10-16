import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { fail } from '../common/errors';
import { SessionService, SessionUser } from './session.service';

type AuthedRequest = Request & { user?: SessionUser };

/**
 * 카카오 로그인한 계정만 허용.
 * 매 요청 DB에서 세션과 탈퇴 여부를 다시 확인한다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = this.sessions.resolve(req);
    if (!user) fail(401, 'LOGIN_REQUIRED', '로그인이 필요해요.');
    req.user = user;
    return true;
  }
}

/** 운영자(ADMIN_KAKAO_IDS)만 허용. AuthGuard 뒤에 둔다. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user?.isAdmin) fail(403, 'FORBIDDEN', '운영자만 할 수 있어요.');
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});
