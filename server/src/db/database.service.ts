import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { AppConfig, CONFIG } from '../config';
import { MIGRATIONS } from './migrations';
import { nowIso } from '../common/event';

interface SeedMenu { slug: string; name: string; price: number | null; image?: string }
interface SeedVendor { slug: string; name: string; zone?: string; image?: string; menus: SeedMenu[] }

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Database.Database;
  private readonly log = new Logger('Database');

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    this.db = new Database(path.join(cfg.dataDir, 'hanippot.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.migrate();
    this.seed();
  }

  onModuleDestroy() {
    this.db.close();
  }

  private migrate() {
    const current = this.db.pragma('user_version', { simple: true }) as number;
    for (let v = current; v < MIGRATIONS.length; v++) {
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[v]);
        this.db.pragma(`user_version = ${v + 1}`);
      })();
      this.log.log(`migration ${v + 1} 적용`);
    }
  }

  /** 공식 업체·메뉴를 slug 기준으로 upsert. 시드에서 빠진 공식 메뉴는 숨김(active=0). */
  private seed() {
    const file = path.join(this.cfg.seedDir, 'menus.json');
    const { vendors } = JSON.parse(fs.readFileSync(file, 'utf8')) as { vendors: SeedVendor[] };
    const now = nowIso();
    const upsertVendor = this.db.prepare(`
      INSERT INTO vendors (slug, name, zone, is_official, vendor_image, sort_order, created_at)
      VALUES (@slug, @name, @zone, 1, @image, @sort, @now)
      ON CONFLICT(slug) DO UPDATE SET name=excluded.name, zone=excluded.zone,
        vendor_image=excluded.vendor_image, sort_order=excluded.sort_order
      RETURNING id`);
    const upsertMenu = this.db.prepare(`
      INSERT INTO menus (vendor_id, slug, name, price, menu_image, is_official, active, sort_order, created_at)
      VALUES (@vendorId, @slug, @name, @price, @image, 1, 1, @sort, @now)
      ON CONFLICT(slug) DO UPDATE SET vendor_id=excluded.vendor_id, name=excluded.name,
        price=excluded.price, menu_image=excluded.menu_image, active=1, sort_order=excluded.sort_order`);

    this.db.transaction(() => {
      const seen: string[] = [];
      vendors.forEach((v, vi) => {
        const { id: vendorId } = upsertVendor.get({
          slug: v.slug, name: v.name, zone: v.zone ?? null,
          image: v.image ? `/media/vendors/${v.image}` : null, sort: vi, now,
        }) as { id: number };
        v.menus.forEach((m, mi) => {
          seen.push(m.slug);
          upsertMenu.run({
            vendorId, slug: m.slug, name: m.name, price: m.price ?? null,
            image: m.image ? `/media/menus/${m.image}` : null, sort: mi, now,
          });
        });
      });
      const placeholders = seen.map(() => '?').join(',');
      this.db.prepare(`UPDATE menus SET active=0 WHERE is_official=1 AND slug NOT IN (${placeholders})`).run(...seen);
    })();
  }
}
