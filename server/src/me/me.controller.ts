import { Body, Controller, Delete, Get, Patch, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { KakaoClient } from '../auth/kakao.client';
import { SessionService, SessionUser } from '../auth/session.service';
import { UsersService } from '../auth/users.service';
import { PostsService } from '../posts/posts.service';

@Controller('me')
export class MeController {
  constructor(
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly posts: PostsService,
    private readonly kakao: KakaoClient,
  ) {}

  /** 비로그인도 200으로 user:null 응답(목록 화면에서 매번 401 오류를 만들지 않기 위해) */
  @Get()
  me(@Req() req: Request) {
    return { user: this.sessions.resolve(req) };
  }

  @Patch()
  @UseGuards(AuthGuard)
  update(@Body() body: { nickname?: unknown }, @CurrentUser() user: SessionUser) {
    const nickname = this.users.setNickname(user.id, body?.nickname);
    return { user: { ...user, nickname, nicknameConfirmed: true } };
  }

  @Get('posts')
  @UseGuards(AuthGuard)
  myPosts(@CurrentUser() user: SessionUser) {
    return { posts: this.posts.mine(user.id) };
  }

  @Delete()
  @UseGuards(AuthGuard)
  async withdraw(@CurrentUser() user: SessionUser, @Req() req: Request, @Res() res: Response) {
    const kakaoId = this.users.withdraw(user.id);
    this.sessions.destroy(req, res);
    const unlinked = kakaoId && !kakaoId.startsWith('mock-') ? await this.kakao.unlink(kakaoId) : false;
    res.json({ ok: true, kakaoUnlinked: unlinked });
  }
}
