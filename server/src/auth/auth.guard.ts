import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { fail } from '../common/errors';
import { SessionService, SessionUser } from './session.service';

type AuthedRequest = Request & { user?: SessionUser };

/**
 * 로그인 + 카카오 성별 정보 확인을 통과한 계정만 허용.
 * 성별이 확인되지 않은 계정은 애초에 세션이 만들어지지 않으므로 세션 존재가 곧 통과 여부다.
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

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});
