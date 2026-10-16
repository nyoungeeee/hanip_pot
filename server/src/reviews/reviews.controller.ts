import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard, AuthGuard, CurrentUser } from '../auth/auth.guard';
import { SessionService, SessionUser } from '../auth/session.service';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly sessions: SessionService,
  ) {}

  /** 메뉴 상세와 후기. 읽기는 로그인 없이도 된다. */
  @Get('menus/:id')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.reviews.menuDetail(id, this.sessions.resolve(req));
  }

  @Post('menus/:id/reviews')
  @UseGuards(AuthGuard)
  create(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @CurrentUser() user: SessionUser) {
    return { review: this.reviews.create(id, user, body) };
  }

  @Get('me/reviews')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() user: SessionUser) {
    return { reviews: this.reviews.mine(user.id) };
  }

  @Delete('me/reviews/:id')
  @UseGuards(AuthGuard)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    this.reviews.remove(id, user.id);
    return { ok: true };
  }

  @Post('admin/reviews/:id/hide')
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  hide(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @CurrentUser() user: SessionUser) {
    this.reviews.hide(id, user, body);
    return { ok: true };
  }

  @Post('admin/reviews/:id/unhide')
  @HttpCode(200)
  @UseGuards(AuthGuard, AdminGuard)
  unhide(@Param('id', ParseIntPipe) id: number) {
    this.reviews.unhide(id);
    return { ok: true };
  }
}
