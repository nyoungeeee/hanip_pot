import { Controller, Get, Module } from '@nestjs/common';
import { loadConfig, CONFIG } from './config';
import { DatabaseService } from './db/database.service';
import { SessionService } from './auth/session.service';
import { UsersService } from './auth/users.service';
import { KakaoClient } from './auth/kakao.client';
import { AdminGuard, AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { PostsService } from './posts/posts.service';
import { PostsController } from './posts/posts.controller';
import { CatalogController } from './catalog/catalog.controller';
import { MeController } from './me/me.controller';
import { UploadsController } from './uploads/uploads.controller';
import { ReviewsService } from './reviews/reviews.service';
import { ReviewsController } from './reviews/reviews.controller';
import { VisitsService } from './visits/visits.service';
import { VisitsController } from './visits/visits.controller';

@Controller('health')
class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  health() {
    this.database.db.prepare('SELECT 1').get();
    return { ok: true };
  }
}

@Module({
  controllers: [HealthController, AuthController, CatalogController, PostsController, MeController, UploadsController, ReviewsController, VisitsController],
  providers: [
    { provide: CONFIG, useFactory: loadConfig },
    DatabaseService,
    SessionService,
    UsersService,
    KakaoClient,
    AuthGuard,
    AdminGuard,
    PostsService,
    ReviewsService,
    VisitsService,
  ],
})
export class AppModule {}
