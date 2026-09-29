import { Controller, Get, Query } from '@nestjs/common';
import { dayLabel, EVENT_DAYS, GUIDELINE_VERSION, kstToday, POST_RULES } from '../common/event';
import { PostsService } from '../posts/posts.service';

@Controller()
export class CatalogController {
  constructor(private readonly posts: PostsService) {}

  @Get('days')
  days() {
    const today = kstToday();
    return {
      days: EVENT_DAYS.map((date) => ({ date, label: dayLabel(date) })),
      // 행사 기간 중이면 오늘, 아니면 첫날을 기본 선택
      defaultDay: (EVENT_DAYS as readonly string[]).includes(today) ? today : EVENT_DAYS[0],
      rules: POST_RULES,
      guidelineVersion: GUIDELINE_VERSION,
    };
  }

  @Get('vendors')
  vendors(@Query('day') day: string) {
    return { day, vendors: this.posts.vendorsWithCounts(day) };
  }

  @Get('menus')
  menus() {
    return { vendors: this.posts.officialMenus() };
  }
}
