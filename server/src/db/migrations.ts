// user_version 기반 순차 마이그레이션. 항목은 추가만 하고 기존 항목은 고치지 않는다.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    kakao_id TEXT UNIQUE,              -- 탈퇴 시 NULL
    nickname TEXT NOT NULL UNIQUE,
    nickname_confirmed INTEGER NOT NULL DEFAULT 0,
    gender_check_at TEXT NOT NULL,     -- 성별 값 자체는 저장하지 않음(통과한 사람만 가입)
    created_at TEXT NOT NULL,
    withdrawn_at TEXT
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE vendors (
    id INTEGER PRIMARY KEY,
    slug TEXT UNIQUE,                  -- 공식 업체 시드 키
    name TEXT NOT NULL,
    zone TEXT,
    is_official INTEGER NOT NULL,
    vendor_image TEXT,                 -- 업체 대표 사진(메뉴 사진 아님)
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE menus (
    id INTEGER PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    slug TEXT UNIQUE,                  -- 공식 메뉴 시드 키
    name TEXT NOT NULL,
    price INTEGER,
    menu_image TEXT,                   -- 메뉴 개별 사진(사용자 업로드 등)
    is_official INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX menus_vendor ON menus(vendor_id);

  CREATE TABLE uploads (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_day TEXT NOT NULL,           -- KST 날짜
    meetup_at TEXT NOT NULL,           -- UTC ISO
    target_people INTEGER NOT NULL,
    open_chat_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
    close_reason TEXT CHECK (close_reason IN ('MANUAL','EXPIRED')),
    guideline_version TEXT NOT NULL,
    guideline_agreed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT,
    cancelled_at TEXT
  );
  CREATE INDEX posts_day_time ON posts(event_day, meetup_at);
  CREATE INDEX posts_organizer ON posts(organizer_id);

  CREATE TABLE post_menus (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    menu_id INTEGER NOT NULL REFERENCES menus(id),
    PRIMARY KEY (post_id, menu_id)
  );
  CREATE INDEX post_menus_menu ON post_menus(menu_id, post_id);
  `,
  // 성별 확인 제거: 확인 시각 대신 마지막 로그인 시각으로 쓴다
  `ALTER TABLE users RENAME COLUMN gender_check_at TO last_login_at;`,
  // 모임 시각을 행사 운영 시간(10:00~24:00 KST)으로 제한: 그 전 시각으로 등록된 글은 그날 10:00으로 옮긴다.
  // 옮긴 시각이 아직 안 지났는데 시간 경과로 종료됐던 글은 다시 모집중으로 돌린다.
  `
  UPDATE posts SET status = 'OPEN', close_reason = NULL, closed_at = NULL
  WHERE status = 'CLOSED' AND close_reason = 'EXPIRED'
    AND strftime('%H:%M', meetup_at, '+9 hours') < '10:00'
    AND event_day || 'T01:00:00.000Z' > strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
  UPDATE posts SET meetup_at = event_day || 'T01:00:00.000Z'
  WHERE strftime('%H:%M', meetup_at, '+9 hours') < '10:00';
  `,
  // 메뉴별 후기(텍스트만). 작성자는 삭제만 가능(소프트 삭제), 운영자는 숨김·복구.
  `
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    menu_id INTEGER NOT NULL REFERENCES menus(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('GOOD','MEH')),
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    hidden_at TEXT,
    hidden_by INTEGER REFERENCES users(id),
    hidden_reason TEXT CHECK (hidden_reason IN ('ABUSE','AD','OFFTOPIC','PRIVACY'))
  );
  CREATE INDEX reviews_menu ON reviews(menu_id, created_at);
  CREATE INDEX reviews_author ON reviews(author_id);
  -- 한 사람이 한 메뉴에 남은 후기는 하나. 지우면 다시 쓸 수 있다.
  CREATE UNIQUE INDEX reviews_one_per_menu ON reviews(menu_id, author_id) WHERE deleted_at IS NULL;
  `,
  // 간단한 방문 집계: 브라우저마다 만든 무작위 id의 해시를 날짜(한국 시간)별로 하나씩. IP·기기 정보는 남기지 않는다.
  `
  CREATE TABLE visits (
    day TEXT NOT NULL,
    visitor TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    first_at TEXT NOT NULL,
    last_at TEXT NOT NULL,
    PRIMARY KEY (day, visitor)
  );
  CREATE INDEX visits_last ON visits(last_at);
  `,
];
