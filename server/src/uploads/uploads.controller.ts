import { Controller, Inject, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { SessionUser } from '../auth/session.service';
import { AppConfig, CONFIG } from '../config';
import { DatabaseService } from '../db/database.service';
import { fail } from '../common/errors';
import { nowIso } from '../common/event';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

@Controller('uploads')
export class UploadsController {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly database: DatabaseService,
  ) {}

  /**
   * 기타 메뉴 사진. 확장자/MIME 헤더를 믿지 않고 실제 디코딩 결과로 판정한 뒤
   * 1200px 이하 WebP로 다시 인코딩한다(EXIF 위치 정보 등 메타데이터 제거).
   */
  @Post()
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: SessionUser) {
    if (!file) fail(400, 'NO_FILE', '사진 파일을 선택해 주세요.');
    let meta: Metadata;
    try {
      meta = await sharp(file.buffer).metadata();
    } catch {
      fail(400, 'INVALID_IMAGE', 'JPG, PNG, WEBP 사진만 올릴 수 있어요.');
    }
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) fail(400, 'INVALID_IMAGE', 'JPG, PNG, WEBP 사진만 올릴 수 있어요.');
    if (!meta.width || !meta.height || meta.width < 100 || meta.height < 100 || meta.width * meta.height > 40_000_000) {
      fail(400, 'INVALID_IMAGE', '사진 크기를 확인해 주세요(가로·세로 100px 이상).');
    }
    const id = crypto.randomUUID();
    const dir = path.join(this.cfg.uploadDir, 'menus');
    fs.mkdirSync(dir, { recursive: true });
    await sharp(file.buffer)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(dir, `${id}.webp`));
    const url = `/uploads/menus/${id}.webp`;
    this.database.db
      .prepare('INSERT INTO uploads (id, owner_id, path, created_at) VALUES (?, ?, ?, ?)')
      .run(id, user.id, url, nowIso());
    return { id, url };
  }
}
