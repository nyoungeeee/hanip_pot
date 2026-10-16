import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { SessionService } from '../auth/session.service';
import { VisitsService } from './visits.service';

@Controller()
export class VisitsController {
  constructor(
    private readonly visits: VisitsService,
    private readonly sessions: SessionService,
  ) {}

  /** 브라우저가 열려 있는 동안 1분마다 보내는 방문 신호. 로그인 없이도 받는다. */
  @Post('visits')
  @HttpCode(204)
  ping(@Body() body: unknown, @Req() req: Request) {
    this.visits.ping(body, this.sessions.resolve(req)?.id ?? null);
  }

  @Get('admin/stats')
  @UseGuards(AuthGuard, AdminGuard)
  stats() {
    return this.visits.stats();
  }
}
