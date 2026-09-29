import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { SessionUser } from '../auth/session.service';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(@Query('day') day: string, @Query('menuId') menuId?: string) {
    const id = menuId ? Number(menuId) : undefined;
    return { posts: this.posts.listPublic(day, Number.isInteger(id) && id! > 0 ? id : undefined) };
  }

  @Get('timeline')
  timeline(@Query('day') day: string) {
    return { groups: this.posts.timeline(day) };
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    return { post: this.posts.detail(id, user.id) };
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@Body() body: unknown, @CurrentUser() user: SessionUser) {
    return { post: this.posts.create(user.id, body) };
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @CurrentUser() user: SessionUser) {
    return { post: this.posts.update(id, user.id, body) };
  }

  @Post(':id/close')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    return { post: this.posts.close(id, user.id) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    return { post: this.posts.cancel(id, user.id) };
  }
}
