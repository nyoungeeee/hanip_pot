import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { nowIso } from '../common/event';
import { NICKNAME_RE, randomNickname, withFreeSuffix } from '../common/nickname';
import { fail } from '../common/errors';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  nicknameTaken = (nickname: string, exceptUserId?: number): boolean =>
    !!this.db.prepare('SELECT 1 FROM users WHERE nickname = ? AND id IS NOT ?').get(nickname, exceptUserId ?? null);

  /** 카카오 계정을 찾거나 새로 만든다. 매 로그인마다 마지막 로그인 시각을 갱신. */
  upsertByKakaoId(kakaoId: string): { id: number; isNew: boolean } {
    const now = nowIso();
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT id FROM users WHERE kakao_id = ?').get(kakaoId) as { id: number } | undefined;
      if (existing) {
        this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, existing.id);
        return { id: existing.id, isNew: false };
      }
      const nickname = withFreeSuffix(randomNickname(), (n) => this.nicknameTaken(n));
      const { lastInsertRowid } = this.db
        .prepare('INSERT INTO users (kakao_id, nickname, nickname_confirmed, last_login_at, created_at) VALUES (?, ?, 0, ?, ?)')
        .run(kakaoId, nickname, now, now);
      return { id: Number(lastInsertRowid), isNew: true };
    })();
  }

  isNicknameConfirmed(userId: number): boolean {
    const row = this.db.prepare('SELECT nickname_confirmed FROM users WHERE id = ?').get(userId) as { nickname_confirmed: number } | undefined;
    return !!row?.nickname_confirmed;
  }

  setNickname(userId: number, raw: unknown) {
    const nickname = typeof raw === 'string' ? raw.trim() : '';
    if (!NICKNAME_RE.test(nickname)) {
      fail(400, 'INVALID_NICKNAME', '닉네임은 한글·영문·숫자·_ 2~12자로 입력해 주세요.');
    }
    if (nickname.startsWith('탈퇴회원')) fail(400, 'INVALID_NICKNAME', '사용할 수 없는 닉네임이에요.');
    if (this.nicknameTaken(nickname, userId)) {
      const suggestion = withFreeSuffix(nickname, (n) => this.nicknameTaken(n, userId));
      fail(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임이에요.', { suggestion });
    }
    this.db.prepare('UPDATE users SET nickname = ?, nickname_confirmed = 1 WHERE id = ?').run(nickname, userId);
    return nickname;
  }

  /**
   * 탈퇴: 카카오 id 연결을 끊고 닉네임을 비식별 값으로 바꾼다.
   * 작성 글은 organizer.withdrawn_at 조건으로 공개 목록에서 모두 숨겨지고, 진행 중이던 글은 취소 처리한다.
   * 반환값은 카카오 연결 해제에 필요한 kakao_id.
   */
  withdraw(userId: number): string | null {
    const now = nowIso();
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT kakao_id FROM users WHERE id = ?').get(userId) as { kakao_id: string | null } | undefined;
      this.db
        .prepare(`UPDATE posts SET status='CANCELLED', cancelled_at=?, updated_at=? WHERE organizer_id=? AND status='OPEN'`)
        .run(now, now, userId);
      this.db
        .prepare(`UPDATE users SET kakao_id = NULL, nickname = ?, withdrawn_at = ? WHERE id = ?`)
        .run(`탈퇴회원_${userId}`, now, userId);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      return row?.kakao_id ?? null;
    })();
  }
}
